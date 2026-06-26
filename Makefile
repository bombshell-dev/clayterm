CC = clang
TARGET = clayterm.wasm
SRC = src/module.c
CLAY_PATCH = patches/clay-disable-debug-tools.patch

CFLAGS = --target=wasm32 -nostdlib -O2 \
         -ffunction-sections -fdata-sections \
         -mbulk-memory \
         -DCLAY_IMPLEMENTATION -DCLAY_WASM \
         -DCLAY_DISABLE_DEBUG_TOOLS \
         -Isrc -I.

EXPORTS = \
  -Wl,--export=__heap_base \
  -Wl,--export=clayterm_size \
  -Wl,--export=init \
  -Wl,--export=reduce \
  -Wl,--export=output \
  -Wl,--export=length \
  -Wl,--export=measure \
  -Wl,--export=Clay_SetPointerState \
  -Wl,--export=pointer_over_count \
  -Wl,--export=pointer_over_id_string_length \
  -Wl,--export=pointer_over_id_string_ptr \
  -Wl,--export=get_element_bounds \
  -Wl,--export=animating \
  -Wl,--export=error_count \
  -Wl,--export=error_type \
  -Wl,--export=error_message_length \
  -Wl,--export=error_message_ptr \
  -Wl,--export=input_size \
  -Wl,--export=input_init \
  -Wl,--export=input_scan \
  -Wl,--export=input_count \
  -Wl,--export=input_event \
  -Wl,--export=input_delay

LDFLAGS = -Wl,--no-entry \
          -Wl,--import-memory \
          -Wl,--stack-first \
          -Wl,--strip-all \
          -Wl,--gc-sections \
          -Wl,--undefined=Clay__MeasureText \
          -Wl,--undefined=Clay__QueryScrollOffset \
          $(EXPORTS)

all: $(TARGET) wasm.ts
	@echo "Built $(TARGET) ($$(wc -c < $(TARGET)) bytes raw, $$(gzip -c $(TARGET) | wc -c) bytes gzip)"

DEPS = $(wildcard src/*.c src/*.h)

# Gate out Clay's unused debug-tools UI (upstream-compatible #ifndef guards),
# opted in via -DCLAY_DISABLE_DEBUG_TOOLS. Idempotent (skips if the guard is
# already present) and verified (fails the build if it didn't apply).
# Drop once Clay ships the flag upstream.
$(TARGET): $(DEPS) $(CLAY_PATCH)
	@grep -q CLAY_DISABLE_DEBUG_TOOLS clay/clay.h || git -C clay apply ../$(CLAY_PATCH)
	@grep -q CLAY_DISABLE_DEBUG_TOOLS clay/clay.h || { echo "ERROR: failed to apply $(CLAY_PATCH) to clay/clay.h" >&2; exit 1; }
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(SRC)

wasm.ts: $(TARGET)
	deno run --allow-read --allow-write tasks/bundle-wasm.ts

clean:
	rm -f $(TARGET) wasm.ts
	-git -C clay checkout -- clay.h

.PHONY: all clean
