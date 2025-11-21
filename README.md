# SignalRMessenger - Minimal MVC + SignalR Chat (SQLite)

This is a minimal starting project demonstrating:
- ASP.NET MVC
- SignalR hub for public and private messaging
- EF Core (SQLite) storing messages
- Loading last 50 messages for a conversation (public or private)

## Quick start

1. Install .NET 8 SDK
2. Open a terminal in the project folder
3. Restore & run:
   ```
   dotnet restore
   dotnet ef migrations add InitialCreate
   dotnet ef database update
   dotnet run
   ```
   (If you don't have EF tools installed: `dotnet tool install --global dotnet-ef`)
4. Open browser at `https://localhost:5001` or `http://localhost:5000`

Notes:
- The project uses SQLite (`chat.db`) via the connection string in `appsettings.json`.
- Migrations are not included in the zip; run the `dotnet ef` commands above to create the DB.
- For production, secure endpoints, add authentication, and configure CORS / HTTPS properly.
