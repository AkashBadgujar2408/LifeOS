using AutoMapper;
using LifeOS.Core.Models;
using LifeOS.Core.Story.DTOs;

namespace LifeOS.Core.Story.AutoMapper;

public class StoryProfile : Profile
{
    public StoryProfile()
    {
        CreateMap<Chapter, ChapterDto>();
    }
}
