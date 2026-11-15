import math, time, datetime, statistics
import threading
import os

from pathlib import Path
from zoneinfo import ZoneInfo
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, BigInteger, Float, String, Index, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base, sessionmaker

TZ = ZoneInfo("Asia/Manila")

# ---------- Anti-Jitter Settings (Tuned for Real Android GPS) ----------
MAX_ACC = 25
MAX_SPEED = 45
GAP = 60
MIN_MOVE = 15
BREAKOUT_DIST = 20
MOVE_MIN_STEP = 4
ACC_MULTIPLIER = 1.8
CONFIRM_COUNT = 3
MIN_STRAIGHTNESS = 0.75
WINDOW_SIZE = 5

ONLINE_SECONDS = 15   # a ping newer than this counts as online

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("GPS_DB_PATH") or BASE_DIR / "tracking.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

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
    accuracy_m = Column(Float)
    __table_args__ = (Index("ix_device_ts", "device_id", "ts", unique=True),)

Base.metadata.create_all(engine)
# Additive migration: retain existing routes; old rows have unknown accuracy.
with engine.begin() as connection:
    if 'accuracy_m' not in {r[1] for r in connection.execute(text('PRAGMA table_info(track_points)'))}:
        connection.execute(text('ALTER TABLE track_points ADD COLUMN accuracy_m FLOAT'))
receive_lock = threading.RLock()

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

state = {}  # device_id -> {lat, lon, ts, seen, seg, rejects, moving, pending, window}
live = {}   # device_id -> {lat, lon, last_seen, first_seen, acc, tracker}

def purge():
    with SessionLocal() as db:
        n = db.query(TrackPoint).filter(TrackPoint.ts < day_start()).delete()
        db.commit()
    if n:
        state.clear()

def purge_loop():
    while True:
        time.sleep(3600)
        purge()

purge()
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
    return 12742000 * math.asin(math.sqrt(min(1, max(0, h))))

def is_coherent_breakout(anchor_lat, anchor_lon, pts):
    dists = [haversine(anchor_lat, anchor_lon, pt[0], pt[1]) for pt in pts]
    if dists[-1] < BREAKOUT_DIST or not all(dists[i] < dists[i + 1] for i in range(len(dists) - 1)):
        return False
    step_sum = sum(haversine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) for i in range(len(pts) - 1))
    if step_sum < 1.0:
        return False
    net_span = haversine(pts[0][0], pts[0][1], pts[-1][0], pts[-1][1])
    return (net_span / step_sum) >= MIN_STRAIGHTNESS

def load_state(db, dev):
    if dev not in state:
        last = db.query(TrackPoint).filter_by(device_id=dev).order_by(TrackPoint.ts.desc()).first()
        state[dev] = {
            "lat": last.lat, "lon": last.lon, "ts": last.ts, "seen": last.ts,
            "seg": last.segment, "rejects": 0, "moving": False,
            "pending": [], "window": [(last.lat, last.lon)]
        } if last else None
    return state[dev]


@gps_service.get("/map")
async def serve_map_app():
    return FileResponse(BASE_DIR / "map.html")

def _receive(batch: Batch, db=Depends(get_db), x_device: str | None = Header(None)):
    # Device binding: tracker tokens are named "username:device_id". If nginx
    # stamped such a name, the payload id must match it. Tokens without a colon
    # (made with add-device) and requests without the header skip this check.
    if x_device and ":" in x_device and x_device.split(":", 1)[1] != batch.id:
        raise HTTPException(status_code=403, detail="Token does not belong to this device")

    s = load_state(db, batch.id)
    rows = []
    accepted_fix = None

    for p in sorted(batch.points, key=lambda p: p.ts):
        if s is not None and p.ts <= s["seen"]:
            continue

        if (not all(math.isfinite(v) for v in (p.lat,p.lon,p.ts)) or
            abs(p.lat)>90 or abs(p.lon)>180 or p.acc is None or
            not math.isfinite(p.acc) or not 0<=p.acc<=MAX_ACC or
            p.ts>time.time()+30 or p.ts<day_start()):
            continue
        quality = s.get('quality', (s['lat'],s['lon'],s['seen'],MAX_ACC)) if s else None
        if quality:
            elapsed = p.ts-quality[2]
            if elapsed <= 0:
                continue
            if elapsed <= 120 and haversine(quality[0],quality[1],p.lat,p.lon) > MAX_SPEED*elapsed+quality[3]+p.acc+25:
                continue
        accepted_fix = p
        if s:
            s['quality'] = (p.lat,p.lon,p.ts,p.acc)
            if quality and p.ts-quality[2] > GAP:
                # Never draw a connector across a reporting gap.
                s.update(lat=p.lat,lon=p.lon,ts=p.ts,seen=p.ts,seg=s['seg']+1,
                         moving=False,pending=[],window=[(p.lat,p.lon)],recent_raw=[],rejects=0)
                rows.append(TrackPoint(device_id=batch.id,ts=p.ts,lat=p.lat,lon=p.lon,segment=s['seg'],accuracy_m=p.acc))
                continue

        if s is None:
            s = {
                "lat": p.lat, "lon": p.lon, "ts": p.ts, "seen": p.ts,
                "seg": 0, "rejects": 0, "moving": False, "quality": (p.lat,p.lon,p.ts,p.acc),
                "pending": [], "window": [(p.lat, p.lon)]
            }
            rows.append(TrackPoint(device_id=batch.id, ts=p.ts, lat=p.lat, lon=p.lon, segment=0, accuracy_m=p.acc))
            continue

        gap = p.ts - s["seen"]
        s["seen"] = p.ts
        d = haversine(s["lat"], s["lon"], p.lat, p.lon)
        dt = max(p.ts - s["ts"], 1)

        # Raw fixes, not the lagging smoothed route point, determine a stop.
        recent = s.setdefault("recent_raw", [])
        recent.append((p.lat, p.lon, p.ts, p.acc))
        recent[:] = [q for q in recent if p.ts-q[2] <= 30]
        if s["moving"] and len(recent) >= 4 and p.ts-recent[0][2] >= 20:
            center_lat = statistics.median(q[0] for q in recent)
            center_lon = statistics.median(q[1] for q in recent)
            radius = max(6, statistics.median(q[3] for q in recent))
            if all(haversine(center_lat,center_lon,q[0],q[1]) <= radius for q in recent):
                s["moving"] = False
                s["pending"].clear()
                s["window"] = [(s["lat"],s["lon"])]

        jitter_radius = max(MIN_MOVE, p.acc * ACC_MULTIPLIER)
        if not s["moving"] and d < jitter_radius:
            s["rejects"] = 0
            s["pending"].clear()
            continue

        if s["moving"] and d < max(MOVE_MIN_STEP, p.acc * 1.2):
            # Keep accumulating real displacement; an uncertain step is not motion.
            # The raw-fix window above confirms an actual stop.
            s["pending"].clear()
            continue

        if d > MAX_SPEED * dt + MAX_ACC * 2 + 25 and gap <= GAP:
            # Repeated bad fixes never earn an automatic acceptance.
            continue
        elif not s["moving"]:
            s["pending"].append((p.lat, p.lon, p.ts))
            if len(s["pending"]) > CONFIRM_COUNT:
                s["pending"].pop(0)
            if len(s["pending"]) < CONFIRM_COUNT:
                continue
            if not is_coherent_breakout(s["lat"], s["lon"], s["pending"]):
                continue
            s["moving"] = True
            s["window"] = [(s["lat"], s["lon"])]
            pending_pts = list(s["pending"])
            s["pending"].clear()
            for lat_p, lon_p, ts_p in pending_pts:
                s["window"].append((lat_p, lon_p))
                if len(s["window"]) > WINDOW_SIZE:
                    s["window"].pop(0)
                sm_lat = statistics.median(pt[0] for pt in s["window"])
                sm_lon = statistics.median(pt[1] for pt in s["window"])
                s.update(lat=sm_lat, lon=sm_lon, ts=ts_p, seen=ts_p, rejects=0)
                rows.append(TrackPoint(device_id=batch.id, ts=ts_p, lat=sm_lat, lon=sm_lon, segment=s["seg"], accuracy_m=p.acc))
            continue

        if gap > GAP:
            s["seg"] += 1
            s["window"].clear()

        s["window"].append((p.lat, p.lon))
        if len(s["window"]) > WINDOW_SIZE:
            s["window"].pop(0)
        smooth_lat = statistics.median(pt[0] for pt in s["window"])
        smooth_lon = statistics.median(pt[1] for pt in s["window"])

        s.update(lat=smooth_lat, lon=smooth_lon, ts=p.ts, seen=p.ts, rejects=0)
        rows.append(TrackPoint(device_id=batch.id, ts=p.ts, lat=smooth_lat, lon=smooth_lon, segment=s["seg"], accuracy_m=p.acc))

    state[batch.id] = s

    if rows:
        try:
            db.add_all(rows)
            db.commit()
        except IntegrityError:          # same batch arrived twice at once
            db.rollback()
            for r in rows:
                try:
                    db.add(TrackPoint(device_id=r.device_id, ts=r.ts, lat=r.lat,
                                      lon=r.lon, segment=r.segment, accuracy_m=r.accuracy_m))
                    db.commit()
                except IntegrityError:
                    db.rollback()

    if s and accepted_fix and time.time()-accepted_fix.ts<=120:
        now = time.time()
        prev = live.get(batch.id, {})
        last_acc = accepted_fix.acc
        tracker = x_device.split(":", 1)[0] if x_device else prev.get("tracker")
        # a gap since the last ping means a new "online session"
        first_seen = prev.get("first_seen", now)
        if now - prev.get("last_seen", 0) > ONLINE_SECONDS:
            first_seen = now
        live[batch.id] = {"lat": s["lat"], "lon": s["lon"], "last_seen": now,
                          "first_seen": first_seen, "acc": last_acc, "tracker": tracker}
    return {"status": "success", "saved": len(rows)}

@gps_service.post("/")
def receive(batch: Batch, db=Depends(get_db), x_device: str | None = Header(None)):
    with receive_lock:
        return _receive(batch, db, x_device)

@gps_service.get("/live/{dev}")
def get_live(dev: str):
    d = live.get(dev)
    if not d:
        return {"status": "not_connected"}
    online = time.time() - d["last_seen"] < ONLINE_SECONDS
    return {"status": "online" if online else "disconnected", "lat": d["lat"], "lon": d["lon"]}

@gps_service.get("/devices")
def devices(include_offline: bool = False):
    now = time.time()
    out = []
    for dev, d in list(live.items()):
        age = now - d["last_seen"]
        online = age < ONLINE_SECONDS
        if not online and not include_offline:
            continue
        out.append({
            "device_id": dev,
            "tracker": d.get("tracker"),
            "status": "online" if online else "disconnected",
            "lat": d["lat"], "lon": d["lon"],
            "accuracy_m": d.get("acc"),
            "last_seen_seconds_ago": int(age),
            "online_for_seconds": int(d["last_seen"] - d.get("first_seen", d["last_seen"])) if online else 0,
        })
    out.sort(key=lambda x: x["last_seen_seconds_ago"])
    return {"count": len(out), "devices": out}

@gps_service.get("/route/{dev}")
def route(dev: str, db=Depends(get_db)):
    rows = (db.query(TrackPoint)
              .filter(TrackPoint.device_id == dev, TrackPoint.ts >= day_start())
              .order_by(TrackPoint.ts).all())
    rows = [r for r in rows if math.isfinite(r.lat) and math.isfinite(r.lon)
            and abs(r.lat)<=90 and abs(r.lon)<=180 and r.ts<=time.time()+30
            and (r.accuracy_m is None or math.isfinite(r.accuracy_m) and 0<=r.accuracy_m<=MAX_ACC)]
    segments, current = [], []
    previous = None
    for index, r in enumerate(rows):
        # Remove isolated historic spikes using their neighboring fixes as evidence.
        following = rows[index+1] if index+1<len(rows) else None
        if following and 0<following.ts-r.ts<=GAP:
            jump = haversine(r.lat,r.lon,following.lat,following.lon)
            reference = previous or (rows[index+2] if index+2<len(rows) else None)
            if reference and jump>MAX_SPEED*(following.ts-r.ts)+125:
                span = abs(following.ts-reference.ts)
                if span<=GAP and haversine(reference.lat,reference.lon,following.lat,following.lon)<=MAX_SPEED*span+125:
                    continue
        if previous:
            elapsed = r.ts-previous.ts
            distance = haversine(previous.lat,previous.lon,r.lat,r.lon)
            if elapsed<=0:
                continue
            if elapsed<=GAP and distance>MAX_SPEED*elapsed+125:
                continue
            if r.segment!=previous.segment or elapsed>GAP or distance>1000:
                if current: segments.append(current)
                current=[]
        current.append({'lat':r.lat,'lon':r.lon,'ts':r.ts,'acc':r.accuracy_m})
        previous=r
    if current: segments.append(current)
    if not segments: return {'segments': []}
    return {'segments': [[[p['lat'],p['lon']] for p in seg] for seg in segments],
            'point_segments': segments}
