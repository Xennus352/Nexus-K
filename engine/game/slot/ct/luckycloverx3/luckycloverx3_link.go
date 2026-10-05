//go:build !prod || full || ct

package luckycloverx3

import (
	_ "embed"

	"github.com/slotopol/server/game"
)

//go:embed luckycloverx3_data.yaml
var data []byte

var Info = game.AlgInfo{
	Aliases: []game.GameAlias{
		{Prov: "CT Interactive", Name: "Lucky Clover x3", LNum: 5, Date: game.Date(2026, 6, 1)}, // see: https://www.livebet.com/casino/slots/ct-interactive/lucky-clover-x3
	},
	AlgDescr: game.AlgDescr{
		GT: game.GTslot,
		GP: game.GPlpay |
			game.GPlsel |
			game.GPfill |
			game.GPfgno |
			game.GPscat |
			game.GPrwild,
		SX: 5,
		SY: 3,
		SN: sn,
		LN: len(BetLines),
		BN: 0,
	},
	Update: func(ai *game.AlgInfo) { ai.RTP = game.MakeRtpList(ReelsMap) },
}

func init() {
	Info.SetupFactory(func(sel int) game.Gamble { return NewGame(sel) }, CalcStat)
	game.DataRouter["ctinteractive/luckycloverx3/rmap"] = &ReelsMap
	game.LoadMap = append(game.LoadMap, data)
}
