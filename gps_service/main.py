import math, time, datetime
import threading

from pathlib import Path
from zoneinfo import ZoneInfo
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, BigInteger, Float, String, Index, event
from sqlalchemy.orm import declarative_base, sessionmaker

TZ = ZoneInfo("Asia/Manila")
MAX_ACC, MAX_SPEED, GAP, MIN_MOVE, MAX_REJECTS = 25, 70, 60, 8, 5
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "tracking.db"

# ---------- DB ----------
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

@event.listens_for(engine, "connect")
def wal(conn, _):
    conn.execute("PRAGMA journal_mode=WAL")

SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()

class TrackPoint(Base):
    __tablename__ = "track_points"
    id = Column(Integer, primary_key=True)
    device_id = Column(String, nullable=False)
    ts = Column(BigInteger, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    segment = Column(Integer, nullable=False)
    __table_args__ = (Index("ix_device_ts", "device_id", "ts", unique=True),)

Base.metadata.create_all(engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def day_start():
    return int(datetime.datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0).timestamp())

# ---------- App ----------
gps_service = FastAPI()
gps_service.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

state = {}  # device_id -> {lat, lon, ts (last accepted), seen (last point seen), seg, rejects}
live = {}   # device_id -> {lat, lon, last_seen}

# daily reset: wipe old points on startup
def purge():
    with SessionLocal() as db:
        n = db.query(TrackPoint).filter(TrackPoint.ts < day_start()).delete()
        db.commit()
    if n:
        state.clear()  # forget yesterday's last points, so each device restarts at segment 0

def purge_loop():
    while True:
        time.sleep(3600)  # check hourly
        purge()

purge()  # on startup
threading.Thread(target=purge_loop, daemon=True).start()

class Point(BaseModel):
    lat: float
    lon: float
    ts: int
    acc: float | None = None

class Batch(BaseModel):
    id: str
    points: list[Point]

def haversine(a, b, c, d):
    p1, p2 = math.radians(a), math.radians(c)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 12742000 * math.asin(math.sqrt(h))

def load_state(db, dev):
    if dev not in state:  # rebuild after a server restart
        last = db.query(TrackPoint).filter_by(device_id=dev).order_by(TrackPoint.ts.desc()).first()
        state[dev] = {"lat": last.lat, "lon": last.lon, "ts": last.ts, "seen": last.ts,
                      "seg": last.segment, "rejects": 0} if last else None
    return state[dev]


@gps_service.get("/map")
async def serve_camera_app():
    return FileResponse(BASE_DIR / "map.html")

@gps_service.post("/")
def receive(batch: Batch, db=Depends(get_db)):
    s = load_state(db, batch.id)
    rows = []

    for p in sorted(batch.points, key=lambda p: p.ts):
        if p.acc is not None and p.acc > MAX_ACC:
            continue                                   # unreliable fix
        if s is None:
            s = {"seg": 0, "rejects": 0}               # first point ever
        elif p.ts <= s["seen"]:
            continue                                   # duplicate / out of order
        else:
            gap = p.ts - s["seen"]
            s["seen"] = p.ts                           # device is alive either way
            d = haversine(s["lat"], s["lon"], p.lat, p.lon)
            if gap > GAP:
                s["seg"] += 1                          # was offline -> new segment
            elif d / max(p.ts - s["ts"], 1) > MAX_SPEED:
                s["rejects"] += 1
                if s["rejects"] < MAX_REJECTS:
                    continue                           # teleport spike
                s["seg"] += 1                          # jump is real -> new segment
            elif d < max(MIN_MOVE, p.acc or 0):
                continue                               # standing still / jitter

        s.update(lat=p.lat, lon=p.lon, ts=p.ts, seen=p.ts, rejects=0)
        rows.append(TrackPoint(device_id=batch.id, ts=p.ts, lat=p.lat, lon=p.lon, segment=s["seg"]))

    state[batch.id] = s
    if rows:
        db.add_all(rows)
        db.commit()
    if s:
        live[batch.id] = {"lat": s["lat"], "lon": s["lon"], "last_seen": time.time()}
    return {"status": "success", "saved": len(rows)}

@gps_service.get("/live/{dev}")
def get_live(dev: str):
    d = live.get(dev)
    if not d:
        return {"status": "not_connected"}
    online = time.time() - d["last_seen"] < 15
    return {"status": "online" if online else "disconnected", "lat": d["lat"], "lon": d["lon"]}

@gps_service.get("/route/{dev}")
def route(dev: str, db=Depends(get_db)):
    rows = (db.query(TrackPoint)
              .filter(TrackPoint.device_id == dev, TrackPoint.ts >= day_start())
              .order_by(TrackPoint.ts))
    segs = {}
    for r in rows:
        segs.setdefault(r.segment, []).append([r.lat, r.lon])
    return {"segments": list(segs.values())}
