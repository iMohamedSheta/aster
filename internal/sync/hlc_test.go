package syncerr

import (
	"testing"
	"time"
)

func TestHLCMonotonic(t *testing.T) {
	now := time.Unix(1700000000, 0)
	c := NewClock("a1b2c3d4")
	c.SetNow(func() time.Time { return now })
	prev := ""
	for i := 0; i < 1000; i++ {
		cur := c.Next()
		if Compare(prev, cur) >= 0 && prev != "" {
			t.Fatalf("clock did not increase: %s then %s", prev, cur)
		}
		prev = cur
	}
}

func TestHLCObserveRemote(t *testing.T) {
	c := NewClock("aaaaaaaa")
	remote := HLC{Millis: time.Now().Add(10 * time.Second).UnixMilli(), Counter: 8, Node: "bbbbbbbb"}
	got := c.Observe(remote.String())
	parsed, err := ParseHLC(got)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Millis < remote.Millis {
		t.Fatalf("observed clock went backwards: %s < %s", got, remote.String())
	}
	if Compare(got, remote.String()) <= 0 {
		t.Fatalf("new clock must sort after remote: %s <= %s", got, remote.String())
	}
}

func TestCompareEmpty(t *testing.T) {
	if Compare("", "0000000000000001:000000:aaaaaaaa") >= 0 {
		t.Fatal("empty clock should sort first")
	}
	if Compare("abc", "abc") != 0 {
		t.Fatal("equal clocks")
	}
}
