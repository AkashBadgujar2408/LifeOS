using AutoMapper;
using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Journal.AutoMapper;

public class JournalProfile : Profile
{
    public JournalProfile()
    {
        CreateMap<JournalEntry, JournalEntryDto>()
            .ForMember(d => d.LifeAreaName, o => o.MapFrom(e => e.LifeArea == null ? null : e.LifeArea.Name))
            .ForMember(d => d.Tags, o => o.MapFrom(e => e.JournalEntryTags
                .OrderBy(t => t.Tag.Name)
                .Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name })));
        CreateMap<WeeklyReflection, WeeklyReflectionDto>();
        CreateMap<MonthlyReflection, MonthlyReflectionDto>();
    }
}
