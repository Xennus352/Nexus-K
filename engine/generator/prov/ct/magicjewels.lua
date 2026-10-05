local scripts = arg[0]:match("^(.*generator[/%\\])")
dofile(scripts.."lib/makereel.lua")

-- Note: Reels with an even distribution of symbols yields an RTP of 300–500% or more.

local symsetbase15 = {
	0, -- 1 wild (2, 3, 4 reels only)
	1, -- 2 crown    5000
	2, -- 3 ruby     1500
	3, -- 4 diamond  500
	3, -- 5 emerald  200
	7, -- 6 amber    50
	9, -- 7 sapphire 50
	9, -- 8 amethyst 40
}
local symsetbase24 = {
	1, -- 1 wild (2, 3, 4 reels only)
	2, -- 2 crown    5000
	7, -- 3 ruby     1500
	10, -- 4 diamond  500
	10, -- 5 emerald  200
	6, -- 6 amber    50
	4, -- 7 sapphire 50
	4, -- 8 amethyst 40
}
local symsetbase3 = {
	1, -- 1 wild (2, 3, 4 reels only)
	1, -- 2 crown    5000
	3, -- 3 ruby     1500
	3, -- 4 diamond  500
	4, -- 5 emerald  200
	10, -- 6 amber    50
	11, -- 7 sapphire 50
	11, -- 8 amethyst 40
}

local symsetfall15 = {
	0, -- 1 wild (2, 3, 4 reels only)
	1, -- 2 crown    5000
	3, -- 3 ruby     1500
	3, -- 4 diamond  500
	3, -- 5 emerald  200
	6, -- 6 amber    50
	9, -- 7 sapphire 50
	9, -- 8 amethyst 40
}
local symsetfall24 = {
	0, -- 1 wild (2, 3, 4 reels only)
	2, -- 2 crown    5000
	6, -- 3 ruby     1500
	10, -- 4 diamond  500
	10, -- 5 emerald  200
	8, -- 6 amber    50
	4, -- 7 sapphire 50
	4, -- 8 amethyst 40
}
local symsetfall3 = {
	1, -- 1 wild (2, 3, 4 reels only)
	1, -- 2 crown    5000
	3, -- 3 ruby     1500
	4, -- 4 diamond  500
	5, -- 5 emerald  200
	8, -- 6 amber    50
	11, -- 7 sapphire 50
	11, -- 8 amethyst 40
}

local neighbours = {
	--1, 2, 3, 4, 5, 6, 7, 8,
	{ 4, 0, 0, 0, 0, 0, 0, 0,}, -- 1 wild (2, 3, 4 reels only)
	{ 0, 4, 0, 0, 0, 0, 0, 0,}, -- 2 crown
	{ 0, 0, 3, 0, 0, 0, 0, 0,}, -- 3 ruby
	{ 0, 0, 0, 2, 0, 0, 0, 0,}, -- 4 diamond
	{ 0, 0, 0, 0, 2, 0, 0, 0,}, -- 5 emerald
	{ 0, 0, 0, 0, 0, 2, 0, 0,}, -- 6 amber
	{ 0, 0, 0, 0, 0, 0, 2, 0,}, -- 7 sapphire
	{ 0, 0, 0, 0, 0, 0, 0, 2,}, -- 8 amethyst
}

local function reelgen(n, isfall)
	local ss
	if n == 1 or n == 5 then
		ss = tcopy(isfall and symsetfall15 or symsetbase15)
	elseif n == 2 or n == 4 then
		ss = tcopy(isfall and symsetfall24 or symsetbase24)
	else
		ss = tcopy(isfall and symsetfall3 or symsetbase3)
	end
	return makereel(ss, neighbours)
end

if autoscan then
	return reelgen
end

math.randomseed(os.time())
local isfall = false
printreel(reelgen(1, isfall))
printreel(reelgen(2, isfall))
printreel(reelgen(3, isfall))
printreel(reelgen(4, isfall))
printreel(reelgen(5, isfall))
