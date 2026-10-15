using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Infrastructure;

/// <summary>
/// Model-validation failures ([Required], [Range], unparseable JSON...) in the same ApiResponse envelope as every
/// other error, instead of ASP.NET's default ProblemDetails — so the client reads one shape (`message`, `errors`)
/// and the user sees the actual reason rather than a generic fallback.
/// </summary>
public static class ValidationResponse
{
    public static IActionResult Create(ActionContext context)
    {
        var errors = context.ModelState
            .Where(entry => entry.Value is { Errors.Count: > 0 })
            // Field errors from the JSON body ("$.dueDate") first: when the body fails to bind, ASP.NET also adds a
            // vague "The request field is required." under the parameter name, which shouldn't be the headline.
            .OrderBy(entry => entry.Key.StartsWith('$') ? 0 : 1)
            .SelectMany(entry => entry.Value!.Errors.Select(error => ErrorText(entry.Key, error)))
            .Distinct()
            .ToList();

        return new BadRequestObjectResult(ApiResponse.Fail(errors.FirstOrDefault() ?? "The request is invalid.", errors));
    }

    // Errors keyed on the JSON body ("$", "$.dueDate") come from the parser and read like it ("The JSON value could not
    // be converted to System.DateOnly. Path: $.dueDate ...", "'b' is an invalid start of a property name"): name the
    // field instead. Everything else ([Required], [Range], query binding) already has a readable message.
    private static string ErrorText(string key, ModelError error)
    {
        if (!key.StartsWith('$') && !string.IsNullOrWhiteSpace(error.ErrorMessage))
        {
            return error.ErrorMessage;
        }

        var field = key.TrimStart('$', '.');
        return string.IsNullOrEmpty(field) ? "The request body isn't valid." : $"The value for '{field}' isn't valid.";
    }
}
