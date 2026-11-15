"""Delayed uploads preserve original metadata, identity and retry idempotency."""
import datetime
import pytest
from tests.test_mobile_access import linked_context, create, metadata, send  # noqa: F401


def expected(client, token):
    identity = client.get('/device-me', headers=token).json()
    return {f'expected_{key}': identity[key] for key in ('tracker_id', 'employee_id', 'employee_code')}


def test_week_old_photo_and_lost_reply(linked_context, pt_client):
    client, _, _ = linked_context
    _, token = create(linked_context)
    old = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)).isoformat()
    meta = metadata(selected_at=old, location_at=old, **expected(client, token))
    response = send(pt_client, token, meta)
    assert response.status_code == 201, response.text
    result = response.json()
    saved = result['mobile_metadata']
    assert datetime.datetime.fromisoformat(saved['selected_at']) == datetime.datetime.fromisoformat(old)
    assert datetime.datetime.fromisoformat(saved['location_at']) == datetime.datetime.fromisoformat(old)
    assert datetime.datetime.fromisoformat(saved['uploaded_at']) > datetime.datetime.fromisoformat(old)
    assert saved['latitude'] == meta['latitude']
    assert saved['accuracy_m'] == meta['accuracy_m']
    assert result['owner'] == 'José Peña'
    assert send(pt_client, token, meta).json()['id'] == result['id']
    assert pt_client.get('/photos', params={'q': 'José Peña', 'timeframe': 'today'}).json()['total'] == 1


@pytest.mark.parametrize('field,value', [('tracker_id', 999999), ('employee_id', 999999), ('employee_code', 'wrong')])
def test_queue_cannot_change_employee_even_on_duplicate(linked_context, pt_client, field, value):
    client, _, _ = linked_context
    _, token = create(linked_context)
    meta = metadata(**expected(client, token))
    assert send(pt_client, token, meta).status_code == 201
    meta['expected_' + field] = value
    assert send(pt_client, token, meta).status_code == 409


def test_partial_identity_guard_rejected(linked_context, pt_client):
    _, token = create(linked_context)
    assert send(pt_client, token, metadata(expected_employee_id=1)).status_code == 409


def test_old_photo_still_requires_precise_nearby_gps(linked_context, pt_client):
    _, token = create(linked_context)
    old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
    assert send(pt_client, token, metadata(selected_at=old.isoformat(), location_at=(old-datetime.timedelta(minutes=3)).isoformat())).status_code == 422
    assert send(pt_client, token, metadata(selected_at=old.isoformat(), location_at=old.isoformat(), accuracy_m=26)).status_code == 422
