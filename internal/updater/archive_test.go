package updater

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestExtractZipRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	archive := filepath.Join(dir, "update.zip")
	f, err := os.Create(archive)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	entry, err := zw.Create("../Aster.exe")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = entry.Write([]byte("bad"))
	_ = zw.Close()
	_ = f.Close()
	if _, err := extractZipFile(archive, filepath.Join(dir, "out"), "Aster.exe"); err == nil {
		t.Fatal("expected traversal zip entry to be rejected")
	}
}

func TestExtractTarGz(t *testing.T) {
	dir := t.TempDir()
	archive := filepath.Join(dir, "update.tar.gz")
	f, err := os.Create(archive)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	payload := []byte("#!/bin/sh\n")
	if err := tw.WriteHeader(&tar.Header{Name: "aster/aster", Mode: 0o755, Size: int64(len(payload))}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(payload); err != nil {
		t.Fatal(err)
	}
	_ = tw.Close()
	_ = gz.Close()
	_ = f.Close()
	written, err := extractTarGz(archive, filepath.Join(dir, "out"))
	if err != nil {
		t.Fatal(err)
	}
	if len(written) != 1 {
		t.Fatalf("written = %d", len(written))
	}
	data, err := os.ReadFile(written[0])
	if err != nil || string(data) != string(payload) {
		t.Fatalf("extracted file: %q %v", data, err)
	}
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(written[0]); err != nil || info.Mode()&0o111 == 0 {
			t.Fatalf("expected executable file: %v %v", info, err)
		}
	}
}

func TestExtractTarGzRejectsSymlink(t *testing.T) {
	dir := t.TempDir()
	archive := filepath.Join(dir, "update.tar.gz")
	f, _ := os.Create(archive)
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	_ = tw.WriteHeader(&tar.Header{Name: "aster/link", Typeflag: tar.TypeSymlink, Linkname: "/etc/passwd"})
	_ = tw.Close()
	_ = gz.Close()
	_ = f.Close()
	if _, err := extractTarGz(archive, filepath.Join(dir, "out")); err == nil {
		t.Fatal("expected symlink to be rejected")
	}
}
