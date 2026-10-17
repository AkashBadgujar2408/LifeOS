using AutoMapper;
using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Habits.AutoMapper;

public class HabitsProfile : Profile
{
    public HabitsProfile()
    {
        // Projected straight to SQL via ProjectTo; Streak and DoneDates are filled in afterwards from the entries.
        CreateMap<Habit, HabitDto>()
            .ForMember(d => d.LifeAreaName, o => o.MapFrom(h => h.LifeArea == null ? null : h.LifeArea.Name))
            .ForMember(d => d.Tags, o => o.MapFrom(h => h.HabitTags
                .OrderBy(t => t.Tag.Name)
                .Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name })))
            .ForMember(d => d.Streak, o => o.Ignore())
            .ForMember(d => d.CleanRun, o => o.Ignore())
            .ForMember(d => d.DoneDates, o => o.Ignore())
            .ForMember(d => d.Values, o => o.Ignore())
            .ForMember(d => d.SlipDates, o => o.Ignore())
            .ForMember(d => d.Challenges, o => o.Ignore());
    }
}
