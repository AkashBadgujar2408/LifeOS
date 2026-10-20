using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Family.Controllers;

/// <summary>Shared reply shapes for Family's controllers: a business failure is a 400, a missing item a 404.</summary>
public abstract class FamilyControllerBase : ControllerBase
{
    protected IActionResult Result<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : BadRequest(ApiResponse<T>.Fail(result.Error!));

    protected IActionResult Found<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : NotFound(ApiResponse<T>.Fail(result.Error!));
}

[ApiController]
[Area("Family")]
[Route("api/[area]/[controller]")]
[Authorize]
public class PeopleController(IRelationshipsService relationshipsService) : FamilyControllerBase
{
    /// <summary>GET api/Family/People?today — every contact A–Z with their place in the tree and next birthday.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly today) =>
        Ok(ApiResponse<List<FamilyPersonDto>>.Ok(await relationshipsService.GetPeopleAsync(today)));
}

[ApiController]
[Area("Family")]
[Route("api/[area]/[controller]")]
[Authorize]
public class RelationshipsController(IRelationshipsService relationshipsService) : FamilyControllerBase
{
    /// <summary>GET api/Family/Relationships — every edge of the tree (RelativeContactId is PersonContactId's Kind; null = you).</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<RelationshipDto>>.Ok(await relationshipsService.GetAllAsync()));

    [HttpPost]
    public async Task<IActionResult> Create(RelationshipRequest request) => Result(await relationshipsService.CreateAsync(request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await relationshipsService.DeleteAsync(id));
}

[ApiController]
[Area("Family")]
[Route("api/[area]/[controller]")]
[Authorize]
public class DatesController(ISignificantDatesService datesService) : FamilyControllerBase
{
    /// <summary>GET api/Family/Dates?today — birthdays, anniversaries and other days, next one first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly today) =>
        Ok(ApiResponse<List<SignificantDateDto>>.Ok(await datesService.GetAllAsync(today)));

    [HttpPost]
    public async Task<IActionResult> Create(SignificantDateRequest request) => Result(await datesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, SignificantDateRequest request) => Result(await datesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await datesService.DeleteAsync(id));
}
