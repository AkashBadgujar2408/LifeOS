using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.Services;

namespace LifeOS.Core.Tests.Family;

public class FamilyTreeTests
{
    // You (null) — Mum 1 + Dad 2 (partners) — Mum's sister 3 — her child 4; your partner 5 and their parent 6;
    // your sibling 7, their child 8; your child 9 (you and your partner are their parents) and grandchild 10;
    // Dad's father 11; 12 a godmother; 13–14 two people the tree doesn't connect to you; 15 your partner's child.
    private static readonly FamilyEdge[] Edges =
    [
        new(null, 1, RelationshipKinds.Parent, "Mother"),
        new(null, 2, RelationshipKinds.Parent, null),
        new(1, 2, RelationshipKinds.Partner, null),
        new(1, 3, RelationshipKinds.Sibling, null),
        new(4, 3, RelationshipKinds.Parent, null),
        new(null, 5, RelationshipKinds.Partner, "Wife"),
        new(5, 6, RelationshipKinds.Parent, null),
        new(null, 7, RelationshipKinds.Sibling, null),
        new(8, 7, RelationshipKinds.Parent, null),
        new(9, null, RelationshipKinds.Parent, null),
        new(9, 5, RelationshipKinds.Parent, null),
        new(10, 9, RelationshipKinds.Parent, null),
        new(2, 11, RelationshipKinds.Parent, null),
        new(null, 12, RelationshipKinds.Other, "Godmother"),
        new(13, 14, RelationshipKinds.Sibling, null),
        new(15, 5, RelationshipKinds.Parent, null),
    ];

    [Theory]
    [InlineData(1, 1, "Parent")]
    [InlineData(2, 1, "Parent")]
    [InlineData(3, 1, "Parent's sibling")]
    [InlineData(4, 0, "Cousin")]
    [InlineData(5, 0, "Partner")]
    [InlineData(6, 1, "Partner's parent")]
    [InlineData(7, 0, "Sibling")]
    [InlineData(8, -1, "Sibling's child")]
    [InlineData(9, -1, "Child")]
    [InlineData(10, -2, "Grandchild")]
    [InlineData(11, 2, "Grandparent")]
    [InlineData(15, -1, "Partner's child")]
    public void Everyone_is_named_by_the_shortest_way_to_them(int contact, int generation, string relation)
    {
        Assert.Equal(new FamilyPlace(generation, relation), FamilyTree.Places(Edges)[contact]);
    }

    [Fact]
    public void A_parents_other_child_is_a_sibling()
    {
        FamilyEdge[] edges = [new(null, 1, RelationshipKinds.Parent, null), new(2, 1, RelationshipKinds.Parent, null)];

        Assert.Equal(new FamilyPlace(0, "Sibling"), FamilyTree.Places(edges)[2]);
    }

    [Fact]
    public void Great_grandparents_and_second_cousins_read_plainly()
    {
        FamilyEdge[] edges =
        [
            new(null, 1, RelationshipKinds.Parent, null),
            new(1, 2, RelationshipKinds.Parent, null),
            new(2, 3, RelationshipKinds.Parent, null),
            new(3, 4, RelationshipKinds.Parent, null),
            new(2, 5, RelationshipKinds.Sibling, null),
            new(6, 5, RelationshipKinds.Parent, null),
            new(7, 6, RelationshipKinds.Parent, null),
        ];
        var places = FamilyTree.Places(edges);

        Assert.Equal(new FamilyPlace(3, "Great-grandparent"), places[3]);
        Assert.Equal(new FamilyPlace(4, "Great-great-grandparent"), places[4]);
        Assert.Equal(new FamilyPlace(0, "Second cousin"), places[7]);
    }

    [Fact]
    public void Other_relations_have_no_generation_and_strangers_no_place()
    {
        var places = FamilyTree.Places(Edges);

        Assert.Equal(new FamilyPlace(null, "Godmother"), places[12]);
        Assert.False(places.ContainsKey(13));
        Assert.False(places.ContainsKey(14));
    }

    [Fact]
    public void A_parent_loop_is_caught_through_you_too()
    {
        // You → Mum 1 → Grandma 2.
        FamilyEdge[] edges = [new(null, 1, RelationshipKinds.Parent, null), new(1, 2, RelationshipKinds.Parent, null)];

        Assert.True(FamilyTree.WouldLoop(edges, 2, 1));     // Mum as Grandma's parent
        Assert.True(FamilyTree.WouldLoop(edges, 2, null));  // you as Grandma's parent
        Assert.True(FamilyTree.WouldLoop(edges, null, null));
        Assert.False(FamilyTree.WouldLoop(edges, 1, 3));    // a second parent for Mum
        Assert.False(FamilyTree.WouldLoop(edges, 4, null)); // a child of yours
    }
}
