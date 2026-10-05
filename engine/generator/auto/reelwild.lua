
-- This script is for reels sets composition by reshuffles reels content.
-- Useful for games with reel wilds or some others cases where symbols
-- reshuffle at the reel gets new RTP. Implemented by sequential scanner
-- run for each reels set.

--- input data begin ---

-- path to slotopol executable file, place here others necessary flags
local exepath = "slot_debug"
-- provider/gamename
local gamename = "ctinteractive/magicjewels"
-- object ID, i.e. provider/gamename/rmap or some other
local objectid = gamename.."/rmap"
-- relative path from project root to reels generator script
local gamescript = "generator/prov/ct/magicjewels.lua"
-- number of reels at videoslot
local reelnum = 5
-- true if should be generated bonus reels set, false for base game
local isbonus = false
-- number of generator iterations
local N = 100
-- RTP granulation, can be 0.5, 1.0, 2.0
local gran = 1.0

-- temporary yaml file to check up by scanner
local genfile = (os.getenv("TEMP") or os.getenv("TMP") or os.getenv("TMPDIR")).."/reelgen.yaml"
-- final yaml file name and path
local devfile = os.getenv("GOPATH").."/bin/reeldev.yaml"
-- external YAML files list, must have at least genfile at the end of list
local extfiles = {
	"reeldev-org.yaml",
	genfile,
}

--- input data end ---

autoscan = true
local reelgen = dofile(gamescript)
assert(type(reelgen) == "function", "reels generator function 'reelgen' does not defined")

local keypool = {}

local cl = nil -- string with command line parameters
local clfmt = "%s --noembed -f=\"%s\" scan -g=\"%s\" -r=50 --cm" -- command line format
cl = string.format(clfmt, exepath, table.concat(extfiles, "\" -f=\""), gamename)
print("running command: "..cl)

local function generate()
	-- make reels set
	local reels = {}
	for i = 1, reelnum do
		reels[i] = reelgen(i, isbonus)
	end

	-- write temporary yaml-file
	local f, err = io.open(genfile, "w")
	if not f then
		error("cannot create generator file: "..err)
	end
	f:write("\n", objectid.."\n", "\n", "---\n", "\n")
	if not isbonus then
		f:write("50:\n")
	end
	for _, reel in ipairs(reels) do
		f:write("  - [" .. table.concat(reel, ", ") .. "] # "..rawlen(reel).."\n")
	end
	f:close()

	-- run scanner
	local h = io.popen(cl)
	if not h then
		error("cannot run command: "..cl)
	end
	local output = h:read("*a")
	h:close()

	reels.comment = assert(output:match("(reels lengths.*)$"), "calculation output does not received")
	reels.rtp = assert(
		tonumber(string.match(reels.comment, "RTP =[^\\n\\r]* (%-?%d+%.?%d-)%%\n")),
		"result RTP does not found, comment is:\n"..reels.comment)

	return reels
end

-- run scanner N times
math.randomseed(os.time())
for stage = 1, N do
	local reels = generate()
	reels.diff = reels.rtp % gran
	local key = string.format("%.1f", reels.rtp - reels.diff)
	if not keypool[key] or keypool[key].diff > reels.diff then
		keypool[key] = reels
	end
	print(string.format("(%d/%d) RTP = %g%%", stage, N, reels.rtp))
end

-- make sorted table with granulated reels sets
local t, i = {}, 1
for _, reels in pairs(keypool) do
	t[i], i = reels, i + 1
end
table.sort(t, function(a, b) return a.rtp < b.rtp end)

-- write final yaml-file
local f, err = io.open(devfile, "w")
if not f then
	error("cannot create results file: "..err)
end
f:write("\n", objectid.."\n", "\n", "---\n", "\n")
for _, reels in pairs(t) do
	f:write("\n", reels.comment:gsub("(.-)\n", "# %1\n")..reels.rtp..":\n")
	for _, reel in ipairs(reels) do
		f:write("  - [" .. table.concat(reel, ", ") .. "] # "..rawlen(reel).."\n")
	end
end
f:close()

print(string.format("%d entries in complete file, spent %g seconds", #t, os.clock()))

os.remove(genfile)
