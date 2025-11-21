using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;

namespace SignalRMessenger.Controllers
{
    public class HomeController : Controller
    {
        private readonly IWebHostEnvironment _env;

        public HomeController(IWebHostEnvironment env)
        {
            _env = env;
        }

        public IActionResult Index()
        {
            return View();
        }

        // POST: /Home/Upload
        [HttpPost]
        [RequestSizeLimit(10_000_000)] // ~10 MB max, change if you want
        public async Task<IActionResult> Upload(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file uploaded.");

            // You can restrict allowed types if you want
            // var allowed = new[] { "image/png", "image/jpeg", "image/gif", "application/pdf" };
            // if (!allowed.Contains(file.ContentType)) return BadRequest("File type not allowed.");

            var uploadsRoot = Path.Combine(_env.WebRootPath, "uploads");
            Directory.CreateDirectory(uploadsRoot);

            var ext = Path.GetExtension(file.FileName);
            var safeFileName = Guid.NewGuid().ToString("N") + ext;
            var filePath = Path.Combine(uploadsRoot, safeFileName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            // URL that browser can use
            var url = Url.Content($"~/uploads/{safeFileName}");

            return Json(new
            {
                url,
                originalName = file.FileName,
                contentType = file.ContentType
            });
        }
    }
}
