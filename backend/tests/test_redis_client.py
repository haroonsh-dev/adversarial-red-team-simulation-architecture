"""Redis stream client batching (xadd_many) unit tests."""

from src.data.redis_client import InMemoryRedis, LiveRedisClient


def test_inmemory_xadd_many_appends_all_entries_in_order():
    r = InMemoryRedis()
    ids = r.xadd_many(
        "events:incoming",
        [{"id": "a"}, {"id": "b"}, {"id": "c"}],
    )
    assert ids == ["1", "2", "3"]

    ids2 = r.xadd_many("events:incoming", [{"id": "d"}])
    assert ids2 == ["4"]

    # Mixed with single xadd keeps append order.
    r.xadd("events:incoming", {"id": "e"})
    stream = r._streams["events:incoming"]
    assert [e["id"] for e in stream] == ["a", "b", "c", "d", "e"]


def test_inmemory_set_get_round_trip():
    r = InMemoryRedis()
    r.set("artsa:hmac:exec:c1", '{"ok":true}', ttl_sec=30)
    assert r.get("artsa:hmac:exec:c1") == '{"ok":true}'
    assert r.get("missing") is None


def test_inmemory_set_nx_is_first_writer_wins_with_ttl():
    r = InMemoryRedis()
    assert r.set_nx("artsa:hmac:nonce:abc", "1", ttl_sec=30) is True
    assert r.set_nx("artsa:hmac:nonce:abc", "1", ttl_sec=30) is False
    assert r.set_nx("artsa:ws:ticket:xyz", "1", ttl_sec=5) is True


class _FakePipe:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []
        self._ids: list[int] = []

    def xadd(self, stream: str, fields: dict):
        self.calls.append((stream, fields))
        self._ids.append(len(self.calls))
        return self

    def execute(self) -> list[int]:
        return self._ids


class _FakeRedis:
    def __init__(self) -> None:
        self.pipe = _FakePipe()
        self.pipeline_calls = 0

    def pipeline(self):
        self.pipeline_calls += 1
        return self.pipe


def test_live_xadd_many_batches_through_one_pipeline():
    client = LiveRedisClient.__new__(LiveRedisClient)
    fake = _FakeRedis()
    client._client = fake

    ids = client.xadd_many("events:incoming", [{"id": "x"}, {"id": "y"}])

    assert ids == ["1", "2"]
    assert fake.pipeline_calls == 1
    assert fake.pipe.calls == [
        ("events:incoming", {"id": "x"}),
        ("events:incoming", {"id": "y"}),
    ]


def test_live_xadd_many_empty_does_not_open_pipeline():
    client = LiveRedisClient.__new__(LiveRedisClient)
    fake = _FakeRedis()
    client._client = fake

    assert client.xadd_many("events:incoming", []) == []
    assert fake.pipeline_calls == 0
