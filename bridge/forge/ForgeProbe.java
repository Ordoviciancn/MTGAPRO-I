import java.nio.file.*;
import java.util.*;
import forge.ai.LobbyPlayerAi;
import forge.card.*;
import forge.deck.Deck;
import forge.game.*;
import forge.game.player.*;
import forge.game.zone.ZoneType;
import forge.item.PaperCard;
import forge.util.Localizer;

public class ForgeProbe {
    public static final class Events {
        private int count;
        @com.google.common.eventbus.Subscribe
        public void onEvent(forge.game.event.Event event) { count++; }
    }
    public static void main(String[] args) throws Exception {
        Path resources = Path.of(args[0]);
        Localizer.getInstance().initialize("en-US", resources.resolve("languages").toString());
        List<RegisteredPlayer> seats = new ArrayList<>();
        for (String name : List.of("Probe A", "Probe B")) {
            seats.add(new RegisteredPlayer(new Deck(name)).setPlayer(new LobbyPlayerAi(name, null)));
        }
        Match match = new Match(new GameRules(GameType.Constructed), seats, "Bridge initialization probe");
        Game game = match.createGame();
        Events events = new Events();
        game.subscribeToEvents(events);
        Player player = game.getPlayers().get(0);
        CardRules rules = CardRules.fromScript(Files.readAllLines(resources.resolve("cardsfolder/m/mountain.txt")));
        PaperCard paper = new PaperCard(rules, "LEA", CardRarity.BasicLand);
        for (int i = 0; i < 3; i++) {
            var card = forge.game.card.Card.fromPaperCard(paper, player);
            game.getAction().moveToLibrary(card, null);
        }
        player.drawCards(1);
        int library = player.getCardsIn(ZoneType.Library).size();
        int hand = player.getCardsIn(ZoneType.Hand).size();
        if (game.getPlayers().size() != 2 || library != 2 || hand != 1 || events.count == 0) throw new IllegalStateException("Unexpected Forge state");
        System.out.println("FORGE_PROBE {\"players\":2,\"library\":2,\"hand\":1,\"engine\":\"forge\",\"matchStarted\":false}");
        System.exit(0);
    }
}
