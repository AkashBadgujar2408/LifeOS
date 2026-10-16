using AutoMapper;
using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Models;

namespace LifeOS.Core.Calendar.AutoMapper;

public class CalendarProfile : Profile
{
    public CalendarProfile()
    {
        CreateMap<Reminder, ReminderDto>()
            .ForMember(d => d.EntityTitle, o => o.Ignore())
            .ForMember(d => d.Recurrence, o => o.MapFrom(r => r.RecurrenceFrequency == null
                ? null
                : new EventRecurrenceDto
                {
                    Frequency = r.RecurrenceFrequency,
                    Interval = r.RecurrenceInterval!.Value,
                    Until = r.RecurrenceUntil,
                }));
    }
}
