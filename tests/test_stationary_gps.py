"""Arrival jitter, walking and vehicle regression cases."""
import time


def send(client, device, coords, accuracy=5):
    start = int(time.time()) - len(coords)*5
    points = [dict(lat=8.15+n/111320, lon=125.12+e/110200,
                   ts=start+i*5, acc=accuracy) for i,(n,e) in enumerate(coords)]
    return client.post('/',json={'id':device,'points':points})


def test_arrival_noise_stops_without_growing_route(gps_client):
    from gps_service import main as gps
    travel=[(n,0) for n in range(0,121,20)]
    jitter=[(120+n,e) for n,e in [(14,0),(10,10),(0,14),(-10,10),(-14,0),(-10,-10),(0,-14),(10,-10)]*6]
    assert send(gps_client,'arrival',travel+jitter,20).status_code==200
    assert not gps.state['arrival']['moving']
    rows=gps_client.get('/route/arrival').json()['segments']
    assert sum(map(len,rows)) < 15
    assert abs(gps.state['arrival']['lat']-(8.15+120/111320))*111320 < 30


def test_walking_keeps_progressing_and_can_resume(gps_client):
    from gps_service import main as gps
    coords=[(n,0) for n in range(0,121,7)]
    coords += [(112+(i%3-1),0) for i in range(12)]
    coords += [(n,0) for n in range(119,241,7)]
    assert send(gps_client,'walker',coords).status_code==200
    assert (gps.state['walker']['lat']-8.15)*111320 > 205
    assert gps.state['walker']['moving']


def test_vehicle_keeps_progressing(gps_client):
    from gps_service import main as gps
    assert send(gps_client,'vehicle',[(n,0) for n in range(0,1201,75)],20).status_code==200
    assert (gps.state['vehicle']['lat']-8.15)*111320 > 1000
