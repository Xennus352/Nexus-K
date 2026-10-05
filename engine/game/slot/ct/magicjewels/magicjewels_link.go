//go:build !prod || full || ct

package magicjewels

import (
	_ "embed"

	"github.com/slotopol/server/game"
)

//go:embed magicjewels_data.yaml
var data []byte

var Info = game.AlgInfo{
	Aliases: []game.GameAlias{
		{Prov: "CT Interactive", Name: "Magic Jewels", LNum: 25, Date: game.Date(2015, 9, 30)}, // see: https://www.livebet2.com/casino/slots/ct-interactive/magic-jewels
	},
	AlgDescr: game.AlgDescr{
		GT: game.GTslot,
		GP: game.GPlpay |
			game.GPcas |
			game.GPcfeat |
			game.GPfgseq |
			game.GPfgmult |
			game.GPwild,
		SX: 5,
		SY: 3,
		SN: sn,
		LN: len(BetLines),
		BN: 0,
	},
	Update: func(ai *game.AlgInfo) { ai.RTP = game.MakeRtpList(ReelsMap) },
}

func init() {
	Info.SetupFactory(func(sel int) game.Gamble { return NewGame() }, CalcStat)
	game.DataRouter["ctinteractive/magicjewels/cas"] = &ReelsCas
	game.DataRouter["ctinteractive/magicjewels/rmap"] = &ReelsMap
	game.LoadMap = append(game.LoadMap, data)
}
