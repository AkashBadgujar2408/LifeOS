using AutoMapper;
using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Models;

namespace LifeOS.Core.Calendar.AutoMapper;

public class CalendarProfile : Profile
{
    public CalendarProfile()
    {
        CreateMap<Event, EventDto>();
    }
}
