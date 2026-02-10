# 🚀 FB Multi Streamer (v0.1.6-PRO)

[![Latest Release](https://img.shields.io/github/v/release/devbysatyam/fb-multi-streamer?color=blue&label=Download%20Latest)](https://github.com/devbysatyam/fb-multi-streamer/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **The ultimate bulk live streaming companion for Facebook Pages.**

FB Multi Streamer is a professional Electron-based application designed for content creators and marketers who need to stream video content across multiple Facebook pages simultaneously. Featuring GPU-accelerated processing, automated comment management, and a premium developer-focused UI.

## 📥 Download

**Looking for the app?**  
Download the latest standalone Windows installer directly from the releases page:

👉 **[Download FB Multi Streamer v0.1.6-PRO](https://github.com/devbysatyam/fb-multi-streamer/releases/latest)**

---

![App Header](https://raw.githubusercontent.com/devbysatyam/fb-multi-streamer/main/public/app-logo.png)

## ✨ Features

- **📺 Bulk Page Streaming**: Stream high-quality video content to dozens of Facebook Pages at once.
- **⚡ Hardware Acceleration**: Full support for **NVENC (Nvidia)**, **QSV (Intel)**, **AMF (AMD)**, and **VAAPI** for ultra-efficient encoding.
- **💬 Smart Engagement**: Automatically post a pre-defined "First Comment" on every live stream to drive engagement.
- **🎬 Stream Management**: Start, stop, and monitor all your streams from a single unified dashboard.
- **🛠️ Integrated Video Library**: Scan local folders, manage metadata, and prepare content with built-in processing profiles.
- **🎨 Brand Kits**: Customize your streams with logos, overlays, and custom branding profiles.
- **🔒 Secure Storage**: All tokens and sensitive data are encrypted locally using industrial-grade AES-256-GCM.
- **📊 Performance Monitoring**: Real-time CPU, Memory, and GPU utilization tracking.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons.
- **Desktop Framework**: Electron 40.2.1.
- **Backend / Data**: Node.js, SQLite (via `better-sqlite3`), IPC-based asynchronous handlers.
- **Processing**: FFmpeg (via `fluent-ffmpeg`) with custom hardware acceleration detection logic.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [FFmpeg](https://ffmpeg.org/) installed and added to your system PATH.
- Facebook App ID & App Secret (with `pages_manage_posts` and `pages_read_engagement` permissions).

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/devbysatyam/fb-multi-streamer.git
   cd fb-multi-streamer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run dev
   ```

### Building the Desktop App

To generate a standalone Windows installer or portable EXE:

```bash
npm run make
```

The output will be located in the `release/0.1.6/` directory.

## 👤 Author

**Satyam Mishra**
- GitHub: [@devbysatyam](https://github.com/devbysatyam)
- Website: [devbysatyam]

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Developed with ❤️ by Satyam Mishra for professional streamers.*
