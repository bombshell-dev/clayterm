CC = clang

CFLAGS = --target=wasm32 -nostdlib -O2 \
         -ffunction-sections -fdata-sections \
         -mbulk-memory \
         -DCLAY_IMPLEMENTATION -DCLAY_WASM \
         -Isrc -I.

LDFLAGS_COMMON = -Wl,--no-entry \
                 -Wl,--import-memory \
                 -Wl,--stack-first \
                 -Wl,--strip-all \
                 -Wl,--gc-sections

LAYOUT_EXPORTS = \
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
  -Wl,--export=error_count \
  -Wl,--export=error_type \
  -Wl,--export=error_message_length \
  -Wl,--export=error_message_ptr

INPUT_EXPORTS = \
  -Wl,--export=__heap_base \
  -Wl,--export=input_size \
  -Wl,--export=input_init \
  -Wl,--export=input_scan \
  -Wl,--export=input_count \
  -Wl,--export=input_event \
  -Wl,--export=input_delay

LAYOUT_LDFLAGS = $(LDFLAGS_COMMON) \
                 -Wl,--undefined=Clay__MeasureText \
                 -Wl,--undefined=Clay__QueryScrollOffset \
                 $(LAYOUT_EXPORTS)

INPUT_LDFLAGS = $(LDFLAGS_COMMON) \
                $(INPUT_EXPORTS)

DEPS = $(wildcard src/*.c src/*.h)

all: clayterm-layout.wasm clayterm-input.wasm wasm-layout.ts wasm-input.ts
	@echo "Built clayterm-layout.wasm ($$(wc -c < clayterm-layout.wasm) bytes raw, $$(gzip -c clayterm-layout.wasm | wc -c) bytes gzip)"
	@echo "Built clayterm-input.wasm  ($$(wc -c < clayterm-input.wasm) bytes raw, $$(gzip -c clayterm-input.wasm | wc -c) bytes gzip)"

clayterm-layout.wasm: $(DEPS)
	$(CC) $(CFLAGS) $(LAYOUT_LDFLAGS) -o $@ src/module-layout.c

clayterm-input.wasm: $(DEPS)
	$(CC) $(filter-out -DCLAY_IMPLEMENTATION -DCLAY_WASM, $(CFLAGS)) $(INPUT_LDFLAGS) -o $@ src/module-input.c

wasm-layout.ts: clayterm-layout.wasm
	deno run --allow-read --allow-write tasks/bundle-wasm.ts clayterm-layout.wasm wasm-layout.ts

wasm-input.ts: clayterm-input.wasm
	deno run --allow-read --allow-write tasks/bundle-wasm.ts clayterm-input.wasm wasm-input.ts

clean:
	rm -f clayterm.wasm clayterm-layout.wasm clayterm-input.wasm wasm.ts wasm-layout.ts wasm-input.ts

.PHONY: all clean
