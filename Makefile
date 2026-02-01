
build:
	@npm install
	@npm run tauri build

run:
	@npm install
	@npm run tauri dev

format:
	@npm run format

clean:
	@rm -rf dist
	@rm -rf node_modules
	@rm -rf src-tauri/target

icon:
	@npm run tauri public/icon.png