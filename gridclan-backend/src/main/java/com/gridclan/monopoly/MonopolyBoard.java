package com.gridclan.monopoly;

import java.util.List;

/**
 * The 40-square Monopoly board, themed to big world cities — pure data.
 *
 * Same structure, prices, colour groups and rent tables as the classic board
 * (like the official "World Edition"); only the names are global cities, and
 * the four railroads are major international airports. Cheapest group → most
 * expensive, so the marquee cities land on the green / dark-blue squares.
 *
 * Square types: GO, PROP (cities), RAIL (airports), UTIL, TAX, CHANCE, CHEST,
 * JAIL (just visiting), GO_TO_JAIL, FREE (free parking).
 * City rents: {base, 1 house, 2, 3, 4, hotel}. Base rent doubles with a
 * complete colour group (applied by the engine).
 */
public final class MonopolyBoard {

    private MonopolyBoard() {}

    public static final int SIZE        = 40;
    public static final int GO_SALARY   = 200;
    public static final int JAIL_SQUARE = 10;
    public static final int JAIL_FINE   = 50;

    public record Square(int index, String type, String name, String group,
                         int price, int houseCost, int[] rent) {
        public boolean ownable() {
            return type.equals("PROP") || type.equals("RAIL") || type.equals("UTIL");
        }
    }

    private static Square prop(int i, String name, String group, int price, int houseCost, int... rent) {
        return new Square(i, "PROP", name, group, price, houseCost, rent);
    }
    private static Square plain(int i, String type, String name) {
        return new Square(i, type, name, null, 0, 0, new int[0]);
    }
    private static Square rail(int i, String name) {
        return new Square(i, "RAIL", name, "RAIL", 200, 0, new int[]{25, 50, 100, 200});
    }
    private static Square util(int i, String name) {
        return new Square(i, "UTIL", name, "UTIL", 150, 0, new int[0]);
    }
    private static Square tax(int i, String name, int amount) {
        return new Square(i, "TAX", name, null, amount, 0, new int[0]);
    }

    public static final List<Square> SQUARES = List.of(
        plain(0, "GO", "GO"),
        prop(1,  "Lagos",        "BROWN",  60,  50,  2, 10, 30, 90, 160, 250),
        plain(2, "CHEST", "Community Chest"),
        prop(3,  "Cairo",        "BROWN",  60,  50,  4, 20, 60, 180, 320, 450),
        tax(4,   "Income Tax", 200),
        rail(5,  "Beijing Airport"),
        prop(6,  "Manila",       "LIGHT_BLUE", 100, 50, 6, 30, 90, 270, 400, 550),
        plain(7, "CHANCE", "Chance"),
        prop(8,  "Jakarta",      "LIGHT_BLUE", 100, 50, 6, 30, 90, 270, 400, 550),
        prop(9,  "Mumbai",       "LIGHT_BLUE", 120, 50, 8, 40, 100, 300, 450, 600),
        plain(10, "JAIL", "Jail / Just Visiting"),
        prop(11, "Cape Town",    "PINK",   140, 100, 10, 50, 150, 450, 625, 750),
        util(12, "Electric Company"),
        prop(13, "Buenos Aires", "PINK",   140, 100, 10, 50, 150, 450, 625, 750),
        prop(14, "São Paulo",    "PINK",   160, 100, 12, 60, 180, 500, 700, 900),
        rail(15, "Hong Kong Airport"),
        prop(16, "Bangkok",      "ORANGE", 180, 100, 14, 70, 200, 550, 750, 950),
        plain(17, "CHEST", "Community Chest"),
        prop(18, "Istanbul",     "ORANGE", 180, 100, 14, 70, 200, 550, 750, 950),
        prop(19, "Mexico City",  "ORANGE", 200, 100, 16, 80, 220, 600, 800, 1000),
        plain(20, "FREE", "Free Parking"),
        prop(21, "Berlin",       "RED",    220, 150, 18, 90, 250, 700, 875, 1050),
        plain(22, "CHANCE", "Chance"),
        prop(23, "Madrid",       "RED",    220, 150, 18, 90, 250, 700, 875, 1050),
        prop(24, "Dubai",        "RED",    240, 150, 20, 100, 300, 750, 925, 1100),
        rail(25, "Atlanta Airport"),
        prop(26, "Barcelona",    "YELLOW", 260, 150, 22, 110, 330, 800, 975, 1150),
        prop(27, "Amsterdam",    "YELLOW", 260, 150, 22, 110, 330, 800, 975, 1150),
        util(28, "Water Works"),
        prop(29, "Singapore",    "YELLOW", 280, 150, 24, 120, 360, 850, 1025, 1200),
        plain(30, "GO_TO_JAIL", "Go To Jail"),
        prop(31, "Sydney",       "GREEN",  300, 200, 26, 130, 390, 900, 1100, 1275),
        prop(32, "Tokyo",        "GREEN",  300, 200, 26, 130, 390, 900, 1100, 1275),
        plain(33, "CHEST", "Community Chest"),
        prop(34, "London",       "GREEN",  320, 200, 28, 150, 450, 1000, 1200, 1400),
        rail(35, "Frankfurt Airport"),
        plain(36, "CHANCE", "Chance"),
        prop(37, "Paris",        "DARK_BLUE", 350, 200, 35, 175, 500, 1100, 1300, 1500),
        tax(38,  "Luxury Tax", 100),
        prop(39, "New York",     "DARK_BLUE", 400, 200, 50, 200, 600, 1400, 1700, 2000)
    );

    public static Square at(int index) { return SQUARES.get(index); }

    /** Street squares of a colour group. */
    public static List<Square> group(String group) {
        return SQUARES.stream().filter(s -> group.equals(s.group())).toList();
    }
}
