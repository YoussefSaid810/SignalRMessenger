SignalR Messenger App

A real-time chat application built using ASP.NET MVC, SignalR, and SQLite, featuring a polished Messenger-style UI with light/dark mode support and modern chat features.

🚀 Features
💬 Messaging

Public & Private Chats

Real-Time Messaging powered by SignalR

Typing Indicator

Delivered ✓✓ & Seen ✓✓ Status

Message History with SQLite

Message Previews in Sidebar

Last Message Timestamp

📎 Attachments

Send Images & Files

Preview Attachment Before Sending

Add Captions to Attachments

Auto rendering of image/file types

🎨 User Interface

Messenger-Inspired Modern UI

Light/Dark Mode with Theme Toggle

Rounded Chat Bubbles

Responsive Layout

Online User Indicator

Soft transitions & styles

🏗️ Tech Stack

Backend

ASP.NET MVC (.NET 6+)

C#

SignalR (WebSockets)

Entity Framework Core

SQLite Database

Frontend

HTML5 / CSS3

JavaScript

SignalR JS Client

Other

File Upload API

Auto theme persistence with LocalStorage

📦 Project Structure
/Controllers
    HomeController.cs

/Hubs
    ChatHub.cs

/Data
    ApplicationDbContext.cs

/wwwroot
    /js/chat.js
    /css (optional)
    /uploads (auto-created)

📝 How It Works

User registers a display name

SignalR maps connectionId → username

Chats update in real-time

Messages and statuses are stored in SQLite

Attachments upload to /wwwroot/uploads

JavaScript:

Renders bubbles

Shows previews

Handles delivered/seen updates

Tracks online users

🎯 Why This Project?

This project demonstrates full-stack capabilities:

Real-time communication architecture

Event-driven systems with SignalR

Clean MVC design & EF Core database usage

Asynchronous file handling

Advanced JavaScript UI development

State management across multiple clients

UX polish + theme design

It’s ideal for showcasing full-stack engineering, real-time systems, and front-end UI polish.

📄 License

MIT — free to use, modify, and distribute.
