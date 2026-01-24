
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
# icon need to be named as "app-icon.png" in the src-tauri/icons directory
# or you can just run `npm run tauri icon xxxxx.png` to set the icon
	@npm run tauri icon 