// Package syncerr implements the replication primitives shared by the
// desktop client and the server: hybrid logical clocks, change envelopes and
// column-level merging.
package syncerr

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// HLC is a hybrid logical clock value. Its string form is fixed-width and
// lexicographically sortable:
//
//	0000017650000000000:000000:0a1b2c3d
//
// Millis are zero-padded to 16 digits so string comparison is chronological
// until the year 2286. Counter is padded to 6 digits.
type HLC struct {
	Millis  int64
	Counter uint32
	Node    string
}

func (h HLC) String() string {
	return fmt.Sprintf("%016d:%06d:%s", h.Millis, h.Counter, h.Node)
}

// ParseHLC parses a serialized clock value.
func ParseHLC(s string) (HLC, error) {
	parts := strings.Split(s, ":")
	if len(parts) != 3 {
		return HLC{}, fmt.Errorf("invalid hlc %q", s)
	}
	millis, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return HLC{}, fmt.Errorf("invalid hlc millis: %w", err)
	}
	counter, err := strconv.ParseUint(parts[1], 10, 32)
	if err != nil {
		return HLC{}, fmt.Errorf("invalid hlc counter: %w", err)
	}
	if len(parts[2]) == 0 {
		return HLC{}, fmt.Errorf("invalid hlc node")
	}
	return HLC{Millis: millis, Counter: uint32(counter), Node: parts[2]}, nil
}

// Compare orders two serialized clock values. Empty values sort first.
func Compare(a, b string) int {
	switch {
	case a == b:
		return 0
	case a == "":
		return -1
	case b == "":
		return 1
	case a < b:
		return -1
	default:
		return 1
	}
}

// Clock is a hybrid logical clock bound to one device node.
type Clock struct {
	mu   sync.Mutex
	node string
	last HLC
	now  func() time.Time
}

// NewClock creates a clock for a node id (8 hex characters by convention).
func NewClock(node string) *Clock {
	if node == "" {
		node = RandomNodeID()
	}
	return &Clock{node: node, now: time.Now}
}

// Node returns the clock's node id.
func (c *Clock) Node() string { return c.node }

// SetNow overrides the wall clock (tests).
func (c *Clock) SetNow(fn func() time.Time) { c.now = fn }

// Next produces a strictly increasing timestamp.
func (c *Clock) Next() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.nextLocked().String()
}

func (c *Clock) nextLocked() HLC {
	wall := c.now().UTC().UnixMilli()
	if wall > c.last.Millis {
		c.last = HLC{Millis: wall, Counter: 0, Node: c.node}
	} else {
		c.last.Counter++
	}
	c.last.Node = c.node
	return c.last
}

// Observe merges a remote clock into the local clock and returns an updated
// local timestamp. This preserves causality when a device receives a change
// with a clock ahead of its own wall time.
func (c *Clock) Observe(remote string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	wall := c.now().UTC().UnixMilli()
	r, err := ParseHLC(remote)
	if err != nil {
		return c.nextLocked().String()
	}
	maxMillis := wall
	if c.last.Millis > maxMillis {
		maxMillis = c.last.Millis
	}
	if r.Millis > maxMillis {
		maxMillis = r.Millis
	}
	switch {
	case maxMillis == c.last.Millis && maxMillis == r.Millis:
		c.last.Counter = max32(c.last.Counter, r.Counter) + 1
	case maxMillis == c.last.Millis:
		c.last.Counter++
	case maxMillis == r.Millis:
		c.last.Counter = r.Counter + 1
	default:
		c.last.Counter = 0
	}
	c.last.Millis = maxMillis
	c.last.Node = c.node
	return c.last.String()
}

func max32(a, b uint32) uint32 {
	if a > b {
		return a
	}
	return b
}

// RandomNodeID returns 8 lowercase hex characters.
func RandomNodeID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failing is catastrophic; fall back to time-derived id.
		return fmt.Sprintf("%08x", time.Now().UnixNano()&0xffffffff)
	}
	return hex.EncodeToString(b)
}

// NowMillis returns wall-clock milliseconds.
func NowMillis() int64 { return time.Now().UTC().UnixMilli() }

// WallTime converts an HLC string to a time. Returns the zero time on error.
func WallTime(hlc string) time.Time {
	h, err := ParseHLC(hlc)
	if err != nil {
		return time.Time{}
	}
	return time.UnixMilli(h.Millis).UTC()
}
