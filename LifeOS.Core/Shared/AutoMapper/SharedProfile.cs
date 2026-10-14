using AutoMapper;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.AutoMapper;

public class SharedProfile : Profile
{
    public SharedProfile()
    {
        CreateMap<Tag, TagDto>();
        CreateMap<InboxItem, InboxItemDto>();
        CreateMap<LifeArea, LifeAreaDto>();
    }
}
