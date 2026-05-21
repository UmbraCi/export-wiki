# Confluence Tauri MVP Manual Test

- [ ] `npm run dev` opens the app on macOS.
- [ ] SSO login completes or shows the manual fallback message without leaking cookies.
- [ ] Manual API Token auth validates against the current user endpoint.
- [ ] Spaces load after authentication.
- [ ] Page tree loads after selecting a space.
- [ ] Exporting one page creates one Markdown file.
- [ ] Exporting one page with one image creates `attachments/<image-name>`.
- [ ] Opening the export folder in Obsidian renders links and images.
- [ ] Logs and returned errors do not contain Cookie, API Token, or password values.
