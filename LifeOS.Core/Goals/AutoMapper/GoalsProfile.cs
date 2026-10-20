using AutoMapper;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Goals.AutoMapper;

public class GoalsProfile : Profile
{
    public GoalsProfile()
    {
        CreateMap<GoalMilestone, GoalMilestoneDto>()
            .ForMember(d => d.FollowsTitle, o => o.MapFrom(m => m.TaskItem != null ? m.TaskItem.Title : m.Project != null ? m.Project.Name : null));
        CreateMap<GoalHistory, GoalHistoryDto>()
            .ForMember(d => d.ChangedFieldsCsv, o => o.MapFrom(h => h.ChangedFields))
            .ForMember(d => d.ChangedFields, o => o.Ignore());

        // Projected straight to SQL via ProjectTo; progress is filled in afterwards through IGoalProgressService.
        CreateMap<Goal, GoalSummaryDto>()
            .ForMember(d => d.MilestoneCount, o => o.MapFrom(g => g.GoalMilestones.Count))
            .ForMember(d => d.CompletedMilestoneCount, o => o.MapFrom(g => g.GoalMilestones.Count(m => m.CompletedAt != null)))
            .ForMember(d => d.NextMilestoneTitle, o => o.MapFrom(g => g.GoalMilestones
                .Where(m => m.CompletedAt == null)
                .OrderBy(m => m.SortOrder).ThenBy(m => m.Id)
                .Select(m => m.Title)
                .FirstOrDefault()))
            .ForMember(d => d.Tags, o => o.MapFrom(g => g.GoalTags
                .OrderBy(gt => gt.Tag.Name)
                .Select(gt => new TagDto { Id = gt.Tag.Id, Name = gt.Tag.Name })))
            .ForMember(d => d.ProgressPercent, o => o.Ignore())
            .ForMember(d => d.ProgressKind, o => o.Ignore())
            .ForMember(d => d.ProgressLocked, o => o.Ignore())
            .ForMember(d => d.MeasureCurrent, o => o.Ignore());

        CreateMap<Goal, GoalDetailDto>()
            .IncludeBase<Goal, GoalSummaryDto>()
            .ForMember(d => d.Milestones, o => o.MapFrom(g => g.GoalMilestones
                .OrderBy(m => m.SortOrder).ThenBy(m => m.Id)))
            .ForMember(d => d.History, o => o.MapFrom(g => g.GoalHistories
                .OrderByDescending(h => h.CreatedAt).ThenByDescending(h => h.Id)));
    }
}
