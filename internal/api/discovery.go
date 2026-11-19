package api

import (
	"encoding/json"
	"fmt"
	"net"
	"time"
)

// Discovery runs on UDP 47822. It only advertises a workspace name and port on
// the local network; no patient data or credentials are involved.
const discoveryPort = 47822

type beaconMessage struct {
	Aster   int    `json:"aster"`
	Name    string `json:"name"`
	Clinic  string `json:"clinic"`
	Port    int    `json:"port"`
	Secure  bool   `json:"secure"`
	Version string `json:"version"`
}

type Discovered struct {
	Name     string `json:"name"`
	ClinicID string `json:"clinicId"`
	Address  string `json:"address"`
	Port     int    `json:"port"`
	Secure   bool   `json:"secure"`
	Version  string `json:"version"`
}

// StartBeacon announces a workspace until stop is closed.
func StartBeacon(stop <-chan struct{}, clinicID, name string, port int, secure bool, version string) {
	msg, _ := json.Marshal(beaconMessage{Aster: 1, Name: name, Clinic: clinicID, Port: port, Secure: secure, Version: version})
	go func() {
		ticker := time.NewTicker(2500 * time.Millisecond)
		defer ticker.Stop()
		send := func() {
			for _, addr := range broadcastAddresses() {
				conn, err := net.DialUDP("udp4", nil, &net.UDPAddr{IP: addr, Port: discoveryPort})
				if err != nil {
					continue
				}
				_, _ = conn.Write(msg)
				conn.Close()
			}
		}
		send()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				send()
			}
		}
	}()
}

func broadcastAddresses() []net.IP {
	seen := map[string]bool{}
	var out []net.IP
	ifaces, err := net.Interfaces()
	if err != nil {
		return []net.IP{net.IPv4bcast}
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipnet.IP.To4()
			if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				continue
			}
			mask := net.IP(ipnet.Mask).To4()
			if mask == nil {
				continue
			}
			b := make(net.IP, 4)
			for i := 0; i < 4; i++ {
				b[i] = ip[i] | ^mask[i]
			}
			if !seen[b.String()] && b.String() != "255.255.255.255" {
				seen[b.String()] = true
				out = append(out, b)
			}
		}
	}
	out = append(out, net.IPv4bcast)
	return out
}

// Discover listens for workspace beacons for the given duration.
func Discover(timeout time.Duration) []Discovered {
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: discoveryPort})
	if err != nil {
		return nil
	}
	defer conn.Close()
	deadline := time.Now().Add(timeout)
	_ = conn.SetReadDeadline(deadline)
	buf := make([]byte, 2048)
	seen := map[string]bool{}
	var out []Discovered
	for {
		n, addr, err := conn.ReadFromUDP(buf)
		if err != nil {
			break
		}
		var msg beaconMessage
		if json.Unmarshal(buf[:n], &msg) != nil || msg.Aster != 1 || msg.Clinic == "" {
			continue
		}
		key := fmt.Sprintf("%s|%s|%d", msg.Clinic, addr.IP.String(), msg.Port)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, Discovered{
			Name: msg.Name, ClinicID: msg.Clinic, Address: addr.IP.String(),
			Port: msg.Port, Secure: msg.Secure, Version: msg.Version,
		})
	}
	return out
}
