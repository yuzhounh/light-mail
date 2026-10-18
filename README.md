<p align="center"><img src="assets/icon.png" width="88" alt="My Mail"></p>
<h1 align="center">My Mail · 我的邮件</h1>
<p align="center">无广告的 Windows 邮件客户端，支持多邮箱、即时通知、本地缓存与自动保存草稿。</p>
<p align="center"><a href="https://github.com/yuzhounh/my-mail/releases/latest">下载 Windows 版本</a> · <a href="https://yuzhounh.github.io/#vibes">个人主页</a></p>

## 下载与运行

在 [Releases](https://github.com/yuzhounh/my-mail/releases/latest) 下载：

- `MyMail-0.1.0-win-x64.exe`：单文件便携版，双击运行，无需安装 Node.js。
- `MyMail-Setup-0.1.0-x64.exe`：安装版，可选择安装目录、创建快捷方式；安装完成后由用户自行启动。

适用于 Windows 10/11 x64。当前发布包未作代码签名。

## 功能

- 多账号与所有收件箱，支持 Gmail、QQ、163/126、腾讯企业邮箱及自定义 IMAP/SMTP。
- 三栏界面，支持分栏调宽、邮箱别名与排序、浅色/深色主题。
- IMAP IDLE 新邮件通知、托盘常驻、开机自启动。
- 邮件列表和已打开正文保存到本机；先显示缓存，再后台同步，网络暂时不可用时仍可阅读已有内容。
- 独立写信窗口，阅读与写信互不遮挡；本地草稿自动保存，关闭或重启后继续编辑。
- 对应邮箱的草稿目录显示本地草稿；当前保留一份待编辑草稿，发送成功后清除，主动放弃需确认。
- 勾选、Ctrl/Shift 多选，Ctrl+A 全选当前已加载邮件；右键批量标记、星标、归档、移动、垃圾邮件和删除。
- 文件夹右键刷新、全部已读、新建子文件夹；自建文件夹可重命名和移动。
- 邮件 HTML 经 DOMPurify 处理，并在无脚本沙箱中显示；外部图片默认显示，固定宽度邮件按阅读区缩放。
- 附件、回复/回复全部/转发、搜索、一键打开邮件自带的退订链接。

## 登录

使用完整邮箱地址和 IMAP/SMTP 授权码或应用专用密码。Gmail 使用 Google 应用专用密码；QQ 和网易邮箱需在网页版开启 IMAP/SMTP 服务并生成授权码。当前不提供 OAuth 登录。

个人 Outlook/Hotmail 多数已关闭密码登录，不能保证可连接。客户端不代理或上传邮箱数据，直接连接用户配置的邮件服务器。

## 本地数据

账户、设置、草稿和邮件缓存位于 `%APPDATA%\my-mail\`。Windows 上的账户密码通过 Electron safeStorage/DPAPI 加密保存。本地草稿与缓存不是云端备份；附件仍按需下载，草稿保留附件的原文件路径。

发布包仅包含应用代码、图标和运行依赖，不包含开发者的账户、密码、草稿、邮件、缓存或日志。

## 开发与打包

```powershell
npm ci
npm start
```

```powershell
npm run check
npm run dist:win
```

Windows 包输出到 `dist/`。可通过 `node scripts/check-drafts.js`、`node scripts/check-mail-actions.js` 等脚本验证草稿与批量操作逻辑，不会发送真实邮件。

源码位于 `src/main/` 和 `src/renderer/`；图标在 `assets/`；开发和验证脚本在 `scripts/`。第三方组件的许可证随其依赖分发。
