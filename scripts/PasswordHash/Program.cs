using System.Text;

// Local helper only: no database access and no password accepted in command arguments.
if (args.Length != 0 || Console.IsInputRedirected)
{
    Console.Error.WriteLine("Run interactively without arguments. Password input is hidden.");
    return 1;
}

string ReadPassword(string prompt)
{
    Console.Write(prompt);
    var value = new StringBuilder();
    while (true)
    {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); return value.ToString(); }
        if (key.Key == ConsoleKey.Escape) throw new OperationCanceledException();
        if (key.Key == ConsoleKey.Backspace)
        {
            if (value.Length > 0) value.Length--;
        }
        else if (!char.IsControl(key.KeyChar)) value.Append(key.KeyChar);
    }
}

try
{
    var password = ReadPassword("New website admin password (hidden; Esc cancels): ");
    if (password.Length < 12 || Encoding.UTF8.GetByteCount(password) > 72)
    {
        Console.Error.WriteLine("Use at least 12 characters and at most 72 UTF-8 bytes.");
        return 1;
    }
    if (password != ReadPassword("Confirm password: "))
    {
        Console.Error.WriteLine("Passwords do not match.");
        return 1;
    }
    Console.WriteLine("BCrypt hash (use this in admins.password):");
    Console.WriteLine(BCrypt.Net.BCrypt.HashPassword(password));
    return 0;
}
catch (OperationCanceledException)
{
    Console.Error.WriteLine("Cancelled. No account was created.");
    return 1;
}
