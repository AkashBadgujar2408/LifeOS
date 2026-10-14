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

        // Counts are scalar subqueries per project (no collection is loaded, so no fan-out); the task navigation goes
        // through the same soft-delete/user filter.
        CreateMap<Project, ProjectDto>()
            .ForMember(d => d.OpenTaskCount, o => o.MapFrom(p => p.TaskItems.Count(t => t.Status == TaskStatuses.Open)))
            .ForMember(d => d.DoneTaskCount, o => o.MapFrom(p => p.TaskItems.Count(t => t.Status == TaskStatuses.Done)))
            .ForMember(d => d.NextDueDate, o => o.MapFrom(p => p.TaskItems
                .Where(t => t.Status == TaskStatuses.Open && t.DueDate != null)
                .Min(t => t.DueDate)));
    }
}
