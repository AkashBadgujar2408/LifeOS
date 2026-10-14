using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class LifeAreasService(AppDbContext db, IMapper mapper) : ILifeAreasService
{
    public async Task<List<LifeAreaDto>> GetAllAsync()
    {
        return await db.LifeAreas
            .OrderBy(a => a.SortOrder)
            .ProjectTo<LifeAreaDto>(mapper.ConfigurationProvider)
            .ToListAsync();
    }
}
