using AutoMapper;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tasks.AutoMapper;

public class TasksProfile : Profile
{
    public TasksProfile()
    {
        // Projected straight to SQL via ProjectTo (one collection — tags — so no fan-out).
        CreateMap<TaskItem, TaskItemDto>()
            .ForMember(d => d.Recurrence, o => o.MapFrom(t => t.RecurrenceFrequency == null
                ? null
                : new TaskRecurrenceDto { Frequency = t.RecurrenceFrequency, Interval = t.RecurrenceInterval!.Value }))
            .ForMember(d => d.Tags, o => o.MapFrom(t => t.TaskTags
                .OrderBy(tt => tt.Tag.Name)
                .Select(tt => new TagDto { Id = tt.Tag.Id, Name = tt.Tag.Name })));
    }
}
