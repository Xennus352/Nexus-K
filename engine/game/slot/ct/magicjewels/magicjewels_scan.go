package magicjewels

import (
	"context"
	"io"

	"github.com/slotopol/server/game/slot"
)

func FSQ(s *slot.StatCascade) float64 {
	var N = float64(s.Count())
	var sum uint64
	sum += s.CascNum(4) * 12
	sum += s.CascNum(5) * 20
	sum += s.Casc[6].N.Load() * 38
	return float64(sum) / N
}

func ΣPL(s *slot.StatCascade) (sum float64) {
	var N = float64(s.Count())
	var Pfg5 = float64(s.CascNum(4)) / N
	sum += Pfg5 * 12
	var Pfg6 = float64(s.CascNum(5)) / N
	sum += Pfg6 * 20
	var Pfg7 float64
	for i := 6; i < slot.FallLimit; i++ {
		Pfg7 += float64(s.CascNum(i)) / N
	}
	sum += Pfg7 * 38
	return
}

func CalcStat(ctx context.Context, sp *slot.ScanPar) (float64, float64) {
	var g = NewGame()
	var s = slot.NewStatCascade(sn, 5)

	var calc = func(w io.Writer) (float64, float64) {
		return slot.Parsheet_fgretrig_custom(w, sp, s, g.Cost(), 2, FSQ(s), ΣPL(s))
	}

	return slot.ScanReelsCommon(ctx, sp, s, g, calc)
}
