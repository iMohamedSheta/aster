package updater

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const maxExtractedBytes = 1 << 30

// extractZipFile pulls one plain file (for example Aster.exe) out of a zip.
// It never writes outside destDir.
func extractZipFile(zipPath, destDir, wanted string) (string, error) {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", fmt.Errorf("open update archive: %w", err)
	}
	defer reader.Close()
	if err := os.MkdirAll(destDir, 0o700); err != nil {
		return "", err
	}
	wanted = strings.ToLower(wanted)
	var found *zip.File
	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		if strings.ToLower(path.Base(strings.ReplaceAll(file.Name, "\\", "/"))) != wanted {
			continue
		}
		if found == nil || strings.Count(file.Name, "/") < strings.Count(found.Name, "/") {
			found = file
		}
	}
	if found == nil {
		return "", fmt.Errorf("update archive does not contain %s", wanted)
	}
	target, err := safeArchivePath(destDir, found.Name)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return "", err
	}
	src, err := found.Open()
	if err != nil {
		return "", fmt.Errorf("read update archive: %w", err)
	}
	defer src.Close()
	dst, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o700)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(dst, io.LimitReader(src, maxExtractedBytes+1)); err != nil {
		dst.Close()
		return "", fmt.Errorf("extract update archive: %w", err)
	}
	if err := dst.Close(); err != nil {
		return "", err
	}
	return target, nil
}

// extractTarGz extracts a Linux update archive. Symlinks and device nodes are
// rejected: an update package only needs regular files.
func extractTarGz(archivePath, destDir string) ([]string, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return nil, fmt.Errorf("open update archive: %w", err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, fmt.Errorf("read update archive: %w", err)
	}
	defer gz.Close()
	if err := os.MkdirAll(destDir, 0o700); err != nil {
		return nil, err
	}
	reader := tar.NewReader(gz)
	var written []string
	var total int64
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read update archive: %w", err)
		}
		target, err := safeArchivePath(destDir, header.Name)
		if err != nil {
			return nil, err
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o700); err != nil {
				return nil, err
			}
		case tar.TypeReg, tar.TypeRegA:
			total += header.Size
			if total > maxExtractedBytes {
				return nil, errors.New("update archive expands beyond the allowed size")
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
				return nil, err
			}
			mode := os.FileMode(header.Mode).Perm()
			if mode == 0 {
				mode = 0o600
			}
			dst, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
			if err != nil {
				return nil, err
			}
			if _, err := io.Copy(dst, io.LimitReader(reader, header.Size+1)); err != nil {
				dst.Close()
				return nil, fmt.Errorf("extract update archive: %w", err)
			}
			if err := dst.Close(); err != nil {
				return nil, err
			}
			written = append(written, target)
		case tar.TypeXGlobalHeader, tar.TypeXHeader:
			// Metadata entries carry no payload.
		default:
			return nil, fmt.Errorf("update archive contains an unsupported entry (%s)", header.Name)
		}
	}
	return written, nil
}

func safeArchivePath(destDir, name string) (string, error) {
	name = strings.ReplaceAll(name, "\\", "/")
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("update archive contains an empty path")
	}
	clean := path.Clean(name)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") || path.IsAbs(clean) {
		return "", fmt.Errorf("update archive contains an unsafe path (%s)", name)
	}
	if len(clean) >= 2 && clean[1] == ':' {
		return "", fmt.Errorf("update archive contains an unsafe path (%s)", name)
	}
	target := filepath.Join(destDir, filepath.FromSlash(clean))
	rel, err := filepath.Rel(destDir, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", fmt.Errorf("update archive contains an unsafe path (%s)", name)
	}
	return target, nil
}
