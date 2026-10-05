local scripts = arg[0]:match("^(.*generator[/%\\])")
dofile(scripts.."lib/makereel.lua")

local symset = {
	1, --  1 wild   (on 2, 3, 4 reels)
	1, --  2 star   (on all reels)
	2, --  3 banana (on 1, 3, 5 reels)
	2, --  4 seven  3000
	4, --  5 shoe   500
	4, --  6 coin   500
	6, --  7 bell   200
	7, --  8 apple  100
	7, --  9 pear   100
	8, -- 10 plum   100
	8, -- 11 cherry 100
}

local chunklen = {
	1, --  1 wild   (on 2, 3, 4 reels)
	1, --  2 star   (on all reels)
	1, --  3 banana (on 1, 3, 5 reels)
	1, --  4 seven
	1, --  5 shoe
	1, --  6 coin
	1, --  7 bell
	3, --  8 apple
	3, --  9 pear
	3, -- 10 plum
	3, -- 11 cherry
}

local scat = {[1]=true, [2]=true, [3]=true}

local function reelgen(n)
	local ss = tcopy(symset)
	if n == 1 or n == 5 then
		ss[1] = 0
	elseif n == 2 or n == 4 then
		ss[3] = 0
	end
	return makereelhot(ss, 3, scat, chunklen)
end

if autoscan then
	return reelgen
end

math.randomseed(os.time())
printreel(reelgen(1))
printreel(reelgen(2))
printreel(reelgen(3))
printreel(reelgen(4))
printreel(reelgen(5))
