using AutoMapper;
using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Models;

namespace LifeOS.Core.Journal.AutoMapper;

public class JournalProfile : Profile
{
    public JournalProfile()
    {
        CreateMap<JournalEntry, JournalEntryDto>()
            .ForMember(d => d.LifeAreaName, o => o.MapFrom(e => e.LifeArea == null ? null : e.LifeArea.Name));
        CreateMap<WeeklyReflection, WeeklyReflectionDto>();
    }
}
