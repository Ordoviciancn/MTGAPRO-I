import com.google.gson.*;
import forge.deck.Deck;
import forge.game.*;
import forge.game.card.*;
import forge.game.player.*;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.game.event.*;
import com.google.common.eventbus.Subscribe;
import forge.gui.GuiBase;
import forge.gui.interfaces.*;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.player.*;
import java.io.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** One process owns one match. Only explicitly projected seat views leave the process. */
public final class ForgeHumanBridge {
    static final Gson JSON = new Gson();
    static final AtomicLong IDS = new AtomicLong();
    static final AtomicLong EVENTS = new AtomicLong();
    static final ExecutorService UI = Executors.newSingleThreadExecutor(r -> new Thread(r, "Bridge UI"));
    static final Seat[] SEATS = new Seat[2];
    static Game game;
    static Match match;
    static int gameNumber;
    static final class MatchStartLobbyPlayer extends LobbyPlayerHuman {
        MatchStartLobbyPlayer(String name){super(name);}
        @Override public Player createIngamePlayer(Game nextGame,int id) {
            Player result=new Player(forge.util.GuiDisplayUtil.personalizeHuman(getName()),nextGame,id);
            result.setFirstController(new PlayerControllerHuman(nextGame,result,this){
                // 第一局：引擎掷币随机选出先手权持有者（调用者即胜者），直接先手，无选择窗口。
                // 后续局：MTG 规则 103.2 由上一局败者决定，回落到 Forge 原生确认窗（先手/后手）。
                @Override public Player chooseStartingPlayer(boolean firstGame) {
                    return firstGame?this.player:super.chooseStartingPlayer(false);
                }
            });
            return result;
        }
    }
    static final boolean[] FULL_CONTROL=new boolean[2];
    // LobbyPlayer.equals 按名字比较：座位重名时 Forge 会把胜场同时记给双方（比分恒为对等）。引擎内名字必须唯一。
    static String[] displayNames=new String[2];
    static Path resources;
    static volatile boolean initialized;
    static synchronized void emit(Object value) { System.out.println("FORGE_BRIDGE " + JSON.toJson(value)); System.out.flush(); }
    static Map<String,Object> obj(Object... pairs) { Map<String,Object> out = new LinkedHashMap<>(); for(int i=0;i<pairs.length;i+=2) out.put((String)pairs[i],pairs[i+1]); return out; }
    static void fail(Throwable e) { e.printStackTrace(System.err); emit(obj("type","error","fatal",true,"message",e.toString())); System.exit(1); }
    @SuppressWarnings("unchecked") static <T> T proxy(Class<T> type, InvocationHandler handler) { return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler); }
    static Object base(Method method,Object[] args) throws Exception {
        String name=method.getName();
        switch(name) {
            case "getAssetsDir": return resources.getParent().toString()+File.separator;
            case "isRunningOnDesktop": case "hasNetGame": return true;
            case "isGuiThread": return Thread.currentThread().getName().equals("Bridge UI");
            case "invokeInEdtLater": UI.execute((Runnable)args[0]); return null;
            case "invokeInEdtNow": case "invokeInEdtAndWait": if(Thread.currentThread().getName().equals("Bridge UI")) ((Runnable)args[0]).run(); else UI.submit((Runnable)args[0]).get(); return null;
            case "getCurrentVersion": return "ForgeHumanBridge";
            case "toString": return "Forge headless base";
        }
        if(method.getReturnType()==void.class) return null;
        if(method.getReturnType()==boolean.class) return false;
        throw new UnsupportedOperationException("Headless base callback: "+method);
    }
    static final class Seat implements InvocationHandler {
        final int index;
        final Player player;
        final PlayerControllerHuman controller;
        volatile String requestId;
        volatile CompletableFuture<JsonElement> pending;
        int choiceMin,choiceMax,choiceSize;
        String choiceKind="choice";
        int initialMainSize;
        String message="";
        boolean okEnabled,cancelEnabled;
        String okLabel="OK",cancelLabel="Cancel";
        Object inputIdentity;
        final Set<Integer> strongSelectables=ConcurrentHashMap.newKeySet();
        final Set<Integer> weakSelectables=ConcurrentHashMap.newKeySet();
        volatile boolean strongSelectionActive;
        final java.util.concurrent.atomic.AtomicBoolean inputQueued=new java.util.concurrent.atomic.AtomicBoolean();
        Seat(int index,Player player) { this.index=index;this.player=player;controller=(PlayerControllerHuman)player.getController(); }
        void input() {
            if(inputQueued.compareAndSet(false,true))UI.execute(()->{inputQueued.set(false);publishInput();});
        }
        void publishInput() {
            if(SEATS[index]!=this || pending!=null)return;
            Object current=controller.getInputProxy().getInput();
            if(current==null || current.getClass().getSimpleName().equals("InputLockUI")){closeInput();return;}
            if(requestId==null || current!=inputIdentity) { requestId=Long.toString(IDS.incrementAndGet());inputIdentity=current; }
            states();
            emit(obj("type","prompt","seat",index,"requestId",requestId,"kind","input","inputType",current==null?"":current.getClass().getSimpleName(),"message",message,"okEnabled",okEnabled,"cancelEnabled",cancelEnabled,"okLabel",okLabel,"cancelLabel",cancelLabel));
        }
        void closeInput(){if(pending==null){requestId=null;emit(obj("type","promptClosed","seat",index));}}
        JsonElement choose(String message,List<?> choices,int min,int max) throws Exception {
            return choose(message,choices,min,max,false);
        }
        JsonElement choose(String message,List<?> choices,int min,int max,boolean ordered) throws Exception {
            CompletableFuture<JsonElement> future=new CompletableFuture<>();
            choiceKind=initialMainSize>0?"sideboard":ordered?"order":"choice";choiceMin=min;choiceMax=max;choiceSize=choices.size();pending=future;
            requestId=Long.toString(IDS.incrementAndGet());
            List<Object> options=new ArrayList<>();
            for(int i=0;i<choices.size();i++) options.add(obj("value",i,"label",String.valueOf(choices.get(i))));
            states();
            emit(obj("type","prompt","seat",index,"requestId",requestId,"kind",choiceKind,"message",message,"options",options,"min",min,"max",max,"initialMainSize",initialMainSize));
            try { return future.get(); } finally { pending=null; requestId=null; }
        }
        List<?> chooseList(String message,List<?> choices,int min,int max) throws Exception {
            return chooseList(message,choices,min,max,false);
        }
        List<?> chooseList(String message,List<?> choices,int min,int max,boolean ordered) throws Exception {
            min=Math.max(0,min);max=max<0?choices.size():Math.min(max,choices.size());
            JsonElement answer=choose(message,choices,min,max,ordered);
            List<JsonElement> indices=new ArrayList<>();
            if(answer.isJsonArray()) answer.getAsJsonArray().forEach(indices::add); else indices.add(answer);
            Set<Integer> unique=new LinkedHashSet<>();
            for(JsonElement i:indices) { int value=i.getAsInt(); if(value<0||value>=choices.size()||!unique.add(value)) throw new IllegalArgumentException("Invalid choice index"); }
            if(unique.size()<min||unique.size()>max) throw new IllegalArgumentException("Invalid selection count");
            List<Object> result=new ArrayList<>(); for(int i:unique) result.add(choices.get(i)); return result;
        }
        int chooseNumber(String message,int min,int max) throws Exception {
            if(min>max)throw new IllegalArgumentException("Invalid numeric bounds");
            CompletableFuture<JsonElement> future=new CompletableFuture<>();
            choiceKind="number";choiceMin=min;choiceMax=max;pending=future;requestId=Long.toString(IDS.incrementAndGet());
            states();emit(obj("type","prompt","seat",index,"requestId",requestId,"kind","number","message",message,"min",min,"max",max));
            try{return future.get().getAsInt();}finally{pending=null;requestId=null;}
        }
        @Override public Object invoke(Object proxy,Method method,Object[] a) throws Throwable {
            String n=method.getName();
            if(method.isDefault()) return InvocationHandler.invokeDefault(proxy,method,a);
            switch(n) {
                case "toString": return "Bridge seat "+index;
                case "getGameView": return game.getView();
                case "isNetGame": return true;
                case "isLibgdxPort": case "isUiSetToSkipPhase": case "isGamePaused": case "isSelecting": return false;
                case "getGameSpeed": return forge.gui.control.PlaybackSpeed.NORMAL;
                case "getDayTime": return "";
                case "getGamestate": return null;
                case "awaitNextInput": closeInput();return null;
                case "setSelectables": strongSelectionActive=true;strongSelectables.clear();for(Object c:(Iterable<?>)a[0])strongSelectables.add(((CardView)c).getId());return null;
                case "clearSelectables": strongSelectables.clear();strongSelectionActive=false;return null;
                case "setWeaklySelectable": weakSelectables.clear();for(Object c:(Iterable<?>)a[0])weakSelectables.add(((CardView)c).getId());return null;
                case "clearWeaklySelectable": weakSelectables.clear();return null;
                // 伦敦调度等输入用高亮标记可选卡，而非 setSelectables：高亮也视为可点击。
                case "setHighlighted": {boolean state=(boolean)a[1];for(Object e:(Iterable<?>)a[0])if(e instanceof CardView cv){if(state)weakSelectables.add(cv.getId());else weakSelectables.remove(cv.getId());}input();return null;}
                case "showPromptMessage": message=String.valueOf(a[1]);input(); return null;
                case "updateButtons": okLabel=(String)a[1];cancelLabel=(String)a[2];okEnabled=(boolean)a[3];cancelEnabled=(boolean)a[4];input();return null;
                case "getAbilityToPlay": {List<?> abilities=(List<?>)a[1];return abilities.size()==1?abilities.get(0):chooseList("Choose ability",abilities,1,1).get(0);}
                case "one": case "oneOrNone": { List<?> picked=chooseList((String)a[0],(List<?>)a[1],n.equals("one")?1:0,1); return picked.isEmpty()?null:picked.get(0); }
                case "getChoices": return chooseList((String)a[0],(List<?>)a[3],(int)a[1],(int)a[2]);
                case "getInteger": return chooseNumber((String)a[0],(int)a[1],(int)a[2]);
                case "sideboard": {
                    var side=(forge.deck.CardPool)a[0];var main=(forge.deck.CardPool)a[1];
                    List<Object> pool=new ArrayList<>(main.toFlatList());pool.addAll(side.toFlatList());
                    initialMainSize=main.countAll();
                    var format=match.getRules().getGameType().getDeckFormat();
                    int minMain=Math.min(initialMainSize,format.getMainRange().getMinimum());
                    int maxSide=format.getSideRange()==null?pool.size():format.getSideRange().getMaximum();
                    try{return chooseList("换备：选择下一局主牌",pool,Math.max(minMain,pool.size()-maxSide),pool.size());}finally{initialMainSize=0;}
                }
                case "many": return chooseList((String)a[0]+" "+a[1],(List<?>)a[4],(int)a[2],(int)a[3]);
                case "order": {
                    List<Object> all=new ArrayList<>((List<?>)a[4]);if(a[5]!=null)all.addAll((List<?>)a[5]);
                    int min=(int)a[3]<0?0:all.size()-(int)a[3],max=(int)a[2]<0?all.size():all.size()-(int)a[2];
                    return new IGuiGame.OrderResult<>(chooseList(a[0]+"\n"+a[1],all,min,max,true),false);
                }
                case "insertInList": {List<Object> ordered=new ArrayList<>((List<?>)a[2]);int position=chooseNumber(a[0]+"\nInsertion index (0 = first)",0,ordered.size());ordered.add(position,a[1]);return ordered;}
                case "confirm": return chooseList((String)a[1],(List<?>)a[3],1,1).get(0).equals(((List<?>)a[3]).get(0));
                case "showConfirmDialog": return chooseList((String)a[0],List.of(a[2],a[3]),1,1).get(0).equals(a[2]);
                case "showOptionDialog": return choose((String)a[0],(List<?>)a[3],1,1).getAsInt();
                case "chooseSingleEntityForEffect": { List<?> picked=chooseList((String)a[0],(List<?>)a[1],(boolean)a[3]?0:1,1);return picked.isEmpty()?null:picked.get(0); }
                case "chooseEntitiesForEffect": return chooseList((String)a[0],(List<?>)a[1],(int)a[2],(int)a[3]);
                case "tempShowZones": return a[1];
                case "openZones": return new PlayerZoneUpdates();
                case "reveal": emit(obj("type","event","seat",index,"message",String.valueOf(a[0]),"items",((List<?>)a[1]).stream().map(String::valueOf).toList()));return null;
                case "message": emit(obj("type","event","seat",index,"message",String.valueOf(a[0])));return null;
                case "showErrorDialog": throw new IllegalStateException(String.valueOf(a[0]));
            }
            if(method.getReturnType()==void.class) return null;
            emit(obj("type","prompt","seat",index,"requestId",Long.toString(IDS.incrementAndGet()),"kind","unsupported","message","Unsupported Forge callback: "+n));
            throw new UnsupportedOperationException("Forge callback: "+method);
        }
    }
    static final class SemanticEvents {
        @Subscribe public void receive(GameEvent event) {
            String kind;
            if(event instanceof GameEventPlayerLivesChanged)kind="life";
            else if(event instanceof GameEventCardChangeZone)kind="zone";
            else if(event instanceof GameEventCardTapped)kind="tap";
            else if(event instanceof GameEventCardDamaged)kind="damage";
            else if(event instanceof GameEventTurnPhase)kind="phase";
            else if(event instanceof GameEventSpellAbilityCast)kind="cast";
            else if(event instanceof GameEventSpellResolved)kind="resolve";
            else if(event instanceof GameEventGameFinished)kind="finished";
            else if(event instanceof GameEventCombatUpdate || event instanceof GameEventCombatChanged || event instanceof GameEventBlockersDeclared)kind="combat";
            else return;
            long sequence=EVENTS.incrementAndGet();
            for(Seat seat:SEATS) {
                if(seat==null)continue;
                Map<String,Object> data=obj();
                if(kind.equals("combat"))data.put("combat",combat());
                if(kind.equals("finished")){data.put("winnerPlayerIds",java.util.Arrays.stream(SEATS).filter(s->s!=null && s.player.getOutcome()!=null && s.player.getOutcome().hasWon()).map(s->s.player.getId()).toList());data.put("gameNumber",gameNumber);}
                CardView card=null;
                if(event instanceof GameEventPlayerLivesChanged e)data=obj("playerId",e.player().getId(),"before",e.oldLives(),"after",e.newLives());
                if(event instanceof GameEventTurnPhase e)data=obj("playerId",e.playerTurn().getId(),"phase",String.valueOf(e.phase()));
                if(event instanceof GameEventCardTapped e){card=e.card();data.put("tapped",e.tapped());}
                if(event instanceof GameEventCardDamaged e){card=e.card();data.put("amount",e.amount());}
                if(event instanceof GameEventCardChangeZone e){
                    data.put("from",e.from()==null?null:String.valueOf(e.from().zoneType()));
                    data.put("to",e.to()==null?null:String.valueOf(e.to().zoneType()));
                    data.put("playerId",e.card().getOwner().getId());
                    card=e.card();
                }
                if(event instanceof GameEventSpellAbilityCast e){card=e.sa().getHostCard();data.put("stackId",e.si().getId());data.put("playerId",e.si().getActivatingPlayer().getId());data.put("targetPlayerIds",e.si().getTargetPlayers().stream().map(PlayerView::getId).toList());data.put("targetCardIds",e.si().getTargetCards().stream().filter(c->c.canBeShownTo(seat.player.getView())).map(CardView::getId).toList());}
                if(event instanceof GameEventSpellResolved e){card=e.spell().getHostCard();data.put("fizzled",e.hasFizzled());}
                if(card!=null)data.putIfAbsent("playerId",card.getController().getId());
                if(card!=null && card.canBeShownTo(seat.player.getView()) && (!card.isFaceDown() || card.mayPlayerLook(seat.player.getView()))) {
                    data.put("cardId",card.getId());data.put("name",card.getCurrentState().getName());
                    if(event instanceof GameEventSpellAbilityCast e){data.put("ability",!e.sa().isSpell());data.put("description",e.sa().getDescription());}
                    if(event instanceof GameEventSpellResolved e){data.put("ability",!e.spell().isSpell());data.put("description",e.spell().getDescription());}
                }
                emit(obj("type","semantic","seat",seat.index,"sequence",sequence,"kind",kind,"data",data));
            }
        }
    }
    static Map<String,Object> card(Card c,Player viewer) {
        Map<String,Object> out=obj("id",c.getId(),"ownerId",c.getOwner().getId(),"controllerId",c.getController().getId(),"tapped",c.isTapped());
        for(Seat seat:SEATS)if(seat!=null && seat.player==viewer)out.put("actionable",(seat.strongSelectionActive?seat.strongSelectables:seat.weakSelectables).contains(c.getId()));
        // 指示物数量是公开信息，牌面朝下也照常投影（如变形、显形附加的指示物）。
        // 佩戴/附魔关系是公开信息：附于其他卡（武具、灵气、工事）时投影目标 id，供客户端叠卡展示。
        if(c.getAttachedTo()!=null)out.put("attachedTo",c.getAttachedTo().getId());
        if(!c.getCounters().isEmpty()){
            Map<String,Integer> counters=new LinkedHashMap<>();
            for(com.google.common.collect.Multiset.Entry<CounterType> e:c.getCounters().entrySet())if(e.getCount()>0)counters.put(e.getElement().getName(),e.getCount());
            if(!counters.isEmpty())out.put("counters",counters);
        }
        if(!c.getView().canBeShownTo(viewer.getView()) || (c.isFaceDown() && !c.getView().mayPlayerLook(viewer.getView()))) { out.put("name","Face-down card");out.put("kind","spell");return out; }
        // token 标记（各类衍生物、复制衍生物）仅在牌面可见时投影，帮助客户端选择卡图检索方式。
        if(c.isToken())out.put("token",true);
        out.put("name",c.getName());out.put("kind",c.isCreature()?"creature":c.isLand()?"land":"spell");
        if(c.isCreature()){out.put("power",c.getNetPower());out.put("toughness",c.getNetToughness());} return out;
    }
    static List<Object> zone(Player owner,ZoneType zone,Player viewer) { List<Object> result=new ArrayList<>();for(Card c:owner.getCardsIn(zone)) result.add(card(c,viewer));return result; }
    // 牌库顶投影：所属座位若能打出该牌（未来视等 MayPlay 静止式），镜像原生 onCardSelected 的判定标记 actionable。
    static Map<String,Object> libraryTop(Player owner,Player viewer) {
        var library=owner.getCardsIn(ZoneType.Library);
        if(library.isEmpty())return null;
        Card top=library.get(0);
        Map<String,Object> out=card(top,viewer);
        if(owner==viewer && !Boolean.TRUE.equals(out.get("actionable"))) {
            for(SpellAbility sa:top.getAllPossibleAbilities(viewer,true)) {out.put("actionable",true);break;}
        }
        return out;
    }
    static List<Object> combat() {
        List<Object> result=new ArrayList<>();var combat=game.getCombat();if(combat==null)return result;
        for(Card attacker:combat.getAttackers()) {
            var defender=combat.getDefenderByAttacker(attacker);
            Map<String,Object> attack=obj("attackerId",attacker.getId(),"blockerIds",combat.getBlockers(attacker).stream().map(Card::getId).toList());
            if(defender instanceof Player p)attack.put("defenderPlayerId",p.getId());
            if(defender instanceof Card c)attack.put("defenderCardId",c.getId());
            result.add(attack);
        }
        return result;
    }
    static void states() {
        if(game==null)return;
        for(Seat seat:SEATS) {if(seat==null)continue; List<Object> players=new ArrayList<>();int playerIndex=0;for(Player p:game.getRegisteredPlayers()){String shown=playerIndex<displayNames.length?displayNames[playerIndex]:p.getName();players.add(obj("id",p.getId(),"name",shown,"life",p.getLife(),"libraryCount",p.getCardsIn(ZoneType.Library).size(),"handCount",p.getCardsIn(ZoneType.Hand).size(),"hand",p==seat.player?zone(p,ZoneType.Hand,seat.player):List.of(),"battlefield",zone(p,ZoneType.Battlefield,seat.player),"graveyard",zone(p,ZoneType.Graveyard,seat.player),"exile",zone(p,ZoneType.Exile,seat.player),"libraryTop",libraryTop(p,seat.player)));playerIndex++;}
            List<Object> stack=new ArrayList<>();for(var item:game.getStack()) {Map<String,Object> projected=card(item.getSourceCard(),seat.player);projected.put("stackId",item.getId());projected.put("ability",!item.getSpellAbility().isSpell());if(!"Face-down card".equals(projected.get("name")))projected.put("description",item.getSpellAbility().getView().getDescription());stack.add(projected);}
            Player active=game.getPhaseHandler().getPlayerTurn();emit(obj("type","state","seat",seat.index,"players",players,"stack",stack,"combat",combat(),"lastEventSequence",EVENTS.get(),"phase",String.valueOf(game.getPhaseHandler().getPhase()),"activePlayerId",active==null?null:active.getId(),"gameOver",game.isGameOver(),"winnerPlayerIds",game.isGameOver()?java.util.Arrays.stream(SEATS).filter(s->s!=null && s.player.getOutcome()!=null && s.player.getOutcome().hasWon()).map(s->s.player.getId()).toList():null,"gameNumber",gameNumber,"bestOf",match.getRules().getGamesPerMatch(),"scores",match.getPlayers().stream().map(p->match.getGamesWonBy(p.getPlayer())).toList(),"matchOver",match.isMatchOver())); }
    }
    static void init(JsonObject input) {
        try {
            String testSeed=System.getenv("FORGE_TEST_SEED");
            if(testSeed!=null) forge.util.MyRandom.setRandom(new Random(Long.parseLong(testSeed)));
            List<RegisteredPlayer> players=new ArrayList<>();
            String firstName=null;int seatIndex=0;
            for(JsonElement entry:input.getAsJsonArray("players")) { JsonObject p=entry.getAsJsonObject();String playerName=p.get("name").getAsString();
                displayNames[seatIndex]=playerName;
                // 引擎内唯一名：与首位重名时追加后缀，仅影响 Forge 内部计分与相等性判断。
                String lobbyName=(firstName!=null&&firstName.equals(playerName))?playerName+" #2":playerName;
                if(firstName==null)firstName=lobbyName;
                Deck deck=new Deck(playerName);
                for(JsonElement line:p.getAsJsonArray("deck")){JsonObject row=line.getAsJsonObject();String name=row.get("name").getAsString();var paper=FModel.getMagicDb().getCommonCards().getCard(name);if(paper==null)throw new IllegalArgumentException("Unknown Forge card: "+name);deck.getMain().add(paper,row.get("count").getAsInt());}
                if(p.has("sideboard"))for(JsonElement line:p.getAsJsonArray("sideboard")){JsonObject row=line.getAsJsonObject();String name=row.get("name").getAsString();var paper=FModel.getMagicDb().getCommonCards().getCard(name);if(paper==null)throw new IllegalArgumentException("Unknown Forge card: "+name);deck.getOrCreate(forge.deck.DeckSection.Sideboard).add(paper,row.get("count").getAsInt());} players.add(new RegisteredPlayer(deck).setPlayer(new MatchStartLobbyPlayer(lobbyName)));seatIndex++; }
            if(players.size()!=2)throw new IllegalArgumentException("Exactly two players required");
            GameRules rules=new GameRules(GameType.Constructed);rules.setGamesPerMatch(input.has("bestOf")&&input.get("bestOf").getAsInt()==3?3:1);match=new Match(rules,players,"Tabletop Forge match");do {gameNumber++;game=match.createGame();
            for(int i=0;i<2;i++){Seat seat=new Seat(i,game.getPlayers().get(i));SEATS[i]=seat;seat.controller.setGui(proxy(IGuiGame.class,seat));seat.controller.getYieldController().setPref(FPref.YIELD_SKIP_PHASE_DELAY,"true");seat.controller.getYieldController().setPref(FPref.YIELD_SKIP_RESOLVE_DELAY,"true");seat.controller.getYieldController().setPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS,Boolean.toString(!FULL_CONTROL[i]));seat.controller.getYieldController().setDisableAutoYields(FULL_CONTROL[i]);seat.controller.getYieldController().setDisableAutoTriggers(FULL_CONTROL[i]);seat.controller.getYieldController().setPref(FPref.UI_SHOW_ACTIONABLE_HIGHLIGHTS,"true");}
            game.subscribeToEvents(new SemanticEvents());
            match.startGame(game);for(Seat seat:SEATS)seat.closeInput();states();}while(!match.isMatchOver());emit(obj("type","event","message","Match finished"));
        } catch(Throwable e){fail(e);}
    }
    static void command(JsonObject input) {
        String type=input.get("type").getAsString();
        if(type.equals("init")){if(initialized)throw new IllegalStateException("Already initialized");initialized=true;new Thread(()->init(input),"Forge match").start();return;}
        int index=input.get("seat").getAsInt();if(index<0||index>1||SEATS[index]==null)throw new IllegalArgumentException("Invalid seat");Seat seat=SEATS[index];
        if(type.equals("control")){boolean full=input.get("fullControl").getAsBoolean();FULL_CONTROL[index]=full;String value=Boolean.toString(!full);var yields=seat.controller.getYieldController();if(full){yields.setAutoPassUntilStackEmpty(false,true);yields.setAutoPassUntilEndOfTurn(false);yields.clearMarker();}yields.setDisableAutoYields(full);yields.setDisableAutoTriggers(full);yields.setPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS,value);emit(obj("type","control","seat",index,"fullControl",full));acknowledge(input,true,null);UI.execute(()->seat.controller.setYieldPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS,value));return;}
        if(type.equals("concede")){if(game.isGameOver()||seat.pending!=null)throw new IllegalStateException("Concession unavailable during modal choice");acknowledge(input,true,null);UI.execute(()->{try{seat.controller.concede();states();}catch(Throwable e){fail(e);}});return;} if(!Objects.equals(seat.requestId,input.get("requestId").getAsString()))throw new IllegalArgumentException("Stale prompt");
        if(type.equals("choice")) {
            CompletableFuture<JsonElement> future=seat.pending;
            if(future==null)throw new IllegalStateException("No modal choice");
            JsonElement value=input.get("value");
            if(seat.choiceKind.equals("number")) {
                if(value==null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber())throw new IllegalArgumentException("Invalid integer");
                double number=value.getAsDouble();
                if(!Double.isFinite(number) || number!=Math.rint(number) || number<seat.choiceMin || number>seat.choiceMax)throw new IllegalArgumentException("Integer out of range");
                seat.requestId=null;acknowledge(input,true,null);future.complete(value);return;
            }
            List<JsonElement> values=new ArrayList<>();
            if(value!=null && value.isJsonArray())value.getAsJsonArray().forEach(values::add);else values.add(value);
            Set<Integer> unique=new HashSet<>();
            for(JsonElement item:values) {
                if(item==null || !item.isJsonPrimitive() || !item.getAsJsonPrimitive().isNumber())throw new IllegalArgumentException("Invalid choice index");
                int i=item.getAsInt();
                if(item.getAsDouble()!=i || i<0 || i>=seat.choiceSize || !unique.add(i))throw new IllegalArgumentException("Invalid choice index");
            }
            if(unique.size()<seat.choiceMin || unique.size()>seat.choiceMax)throw new IllegalArgumentException("Invalid selection count");
            seat.requestId=null;
            acknowledge(input,true,null);
            future.complete(value);return;
        }
        UI.execute(()->{
            boolean delivered=false;
            try {
                if(!Objects.equals(seat.requestId,input.get("requestId").getAsString()) || seat.pending!=null || seat.inputIdentity!=seat.controller.getInputProxy().getInput())throw new IllegalArgumentException("Stale prompt");
                var inputProxy=seat.controller.getInputProxy();
                Runnable action;
                switch(type) {
                    case "ok": if(!seat.okEnabled)throw new IllegalStateException("OK disabled");action=inputProxy::selectButtonOK;break;
                    case "cancel": if(!seat.cancelEnabled)throw new IllegalStateException("Cancel disabled");action=inputProxy::selectButtonCancel;break;
                    case "selectCard": {
                        int id=input.get("cardId").getAsInt();Card found=null;
                        for(Card c:game.getCardsInGame())if(c.getId()==id)found=c;
                        if(found==null || !found.getView().canBeShownTo(seat.player.getView()))throw new IllegalArgumentException("Card unavailable");
                        Card selected=found;action=()->{if(!inputProxy.selectCard(selected.getView(),null,null))seat.input();};break;
                    }
                    case "selectPlayer": {
                        int id=input.get("playerId").getAsInt();Player found=null;
                        for(Player p:game.getPlayers())if(p.getId()==id)found=p;
                        if(found==null)throw new IllegalArgumentException("Player unavailable");
                        Player selected=found;action=()->{inputProxy.selectPlayer(selected.getView(),null);seat.input();};break;
                    }
                    default:throw new IllegalArgumentException("Unknown command");
                }
                seat.requestId=null;
                acknowledge(input,true,null);
                delivered=true;
                action.run();states();
            } catch(Throwable e) { if(delivered)fail(e);else acknowledge(input,false,e.toString()); }
        });
    }
    static void acknowledge(JsonObject input,boolean accepted,String error) {
        if(input.has("commandId"))emit(obj("type","ack","commandId",input.get("commandId").getAsString(),"accepted",accepted,"message",error));
        else if(!accepted)emit(obj("type","error","fatal",false,"message",error));
    }
    public static void main(String[] args) throws Exception {
        resources=Path.of(args[0]).toAbsolutePath();Path session=Path.of(args[1]).toAbsolutePath();Files.createDirectories(session);
        GuiBase.setInterface(proxy(IGuiBase.class,(p,m,a)->base(m,a)));
        Thread.setDefaultUncaughtExceptionHandler((t,e)->fail(e));
        FModel.initialize(proxy(IProgressBar.class,(p,m,a)->m.getReturnType()==boolean.class?false:null),prefs->{prefs.setPref(FPref.UI_LANGUAGE,"zh-CN");prefs.setPref(FPref.LOAD_CARD_SCRIPTS_LAZILY,true);prefs.setPref(FPref.UI_SELECT_FROM_CARD_DISPLAYS,false);return null;});
        emit(obj("type","ready","engine","forge","protocol",1));
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(System.in,java.nio.charset.StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null){JsonObject input=null;try{input=JsonParser.parseString(line).getAsJsonObject();command(input);}catch(Throwable e){if(input!=null)acknowledge(input,false,e.toString());else emit(obj("type","error","fatal",false,"message",e.toString()));}}}
        System.exit(0);
    }
}
