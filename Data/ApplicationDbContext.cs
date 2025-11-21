using Microsoft.EntityFrameworkCore;
using SignalRMessenger.Models;

namespace SignalRMessenger.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<Message> Messages { get; set; } = default!;
}
