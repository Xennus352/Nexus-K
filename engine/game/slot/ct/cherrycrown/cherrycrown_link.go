//go:build !prod || full || ct

package cherrycrown

import (
	_ "embed"

	"github.com/slotopol/server/game"
)

//go:embed cherrycrown_data.yaml
var data []byte

var Info = game.AlgInfo{
	Aliases: []game.GameAlias{
		{Prov: "CT Interactive", Name: "Cherry Crown", LNum: 20, Date: game.Date(2018, 9, 10)},        // see: https://www.slotsmate.com/software/ct-interactive/cherry-crown
		{Prov: "CT Interactive", Name: "Satyr and Nymph", LNum: 20, Date: game.Date(2020, 11, 1)},     // see: https://www.slotsmate.com/software/ct-interactive/satyr-and-nymph
		{Prov: "CT Interactive", Name: "Satyr and Nymph Dice", LNum: 20, Date: game.Date(2015, 5, 4)}, // see: https://www.livebet.com/casino/slots/ct-interactive/satyr-and-nymph-dice
	},
	AlgDescr: game.AlgDescr{
		GT: game.GTslot,
		GP: game.GPlpay |
			game.GPfgno |
			game.GPscat |
			game.GPewild,
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
	game.DataRouter["ctinteractive/cherrycrown/rmap"] = &ReelsMap
	game.LoadMap = append(game.LoadMap, data)
}
