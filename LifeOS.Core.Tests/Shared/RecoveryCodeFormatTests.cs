using System.Text.RegularExpressions;
using LifeOS.Core.Shared.Services;

namespace LifeOS.Core.Tests.Shared;

public class RecoveryCodeFormatTests
{
    [Fact]
    public void A_set_is_eight_distinct_codes_in_four_groups_of_four_without_lookalike_characters()
    {
        var codes = RecoveryCodeFormat.GenerateSet();

        Assert.Equal(RecoveryCodeFormat.CodesPerSet, codes.Count);
        Assert.Equal(codes.Count, codes.Distinct().Count());
        Assert.All(codes, code => Assert.Matches(new Regex("^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$"), code));
    }

    [Fact]
    public void How_a_code_is_typed_doesnt_change_its_hash()
    {
        var hash = RecoveryCodeFormat.Hash("K7QM-2XRD-P9WA-HN4C");

        Assert.Equal(hash, RecoveryCodeFormat.Hash("k7qm2xrdp9wahn4c"));
        Assert.Equal(hash, RecoveryCodeFormat.Hash("  K7QM 2XRD-p9wa HN4C "));
        Assert.NotEqual(hash, RecoveryCodeFormat.Hash("K7QM-2XRD-P9WA-HN4D"));
    }

    [Fact]
    public void The_hash_is_64_upper_case_hex_characters()
    {
        Assert.Matches(new Regex("^[0-9A-F]{64}$"), RecoveryCodeFormat.Hash("ABCD-EFGH-JKLM-NPQR"));
    }
}
