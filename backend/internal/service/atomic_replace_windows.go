//go:build windows

package service

import "golang.org/x/sys/windows"

func atomicReplace(source, destination string) error {
	from, err := windows.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	to, err := windows.UTF16PtrFromString(destination)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(
		from,
		to,
		windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH,
	)
}

func syncDirectory(_ string) error {
	// MoveFileEx with MOVEFILE_WRITE_THROUGH has already completed the durable
	// replacement; Windows does not expose Unix directory fsync semantics.
	return nil
}
