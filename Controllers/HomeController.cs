using Microsoft.AspNetCore.Mvc;

namespace SignalRMessenger.Controllers;

public class HomeController : Controller
{
    public IActionResult Index()
    {
        return View();
    }
}
