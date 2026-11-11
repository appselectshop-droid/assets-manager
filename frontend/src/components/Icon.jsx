// Íconos de la app — catálogo Lucide (lucide.dev, licencia ISC/MIT).
// Pedido explícito del usuario (2026-11-11): "ya no quiero que se usen
// stickers como íconos, busca un catálogo". Todos los emoji que la app usaba
// como ícono pasan por aquí y se dibujan como SVG de un solo trazo, del color
// del texto (currentColor) y del tamaño de la letra (1em) — así cada lugar
// conserva el tamaño/color que ya le daba su CSS.
//
// Uso:
//   <Icon e="📦" />            emoji → ícono (los datos guardados con emoji,
//                              ej. reacciones de Becarios, siguen funcionando)
//   <Icon e={item.icon} />     igual, con valor que viene de un objeto
//   <Icon as={Package} />      ícono de Lucide directo, para código nuevo
//   <EmojiText>{texto}</EmojiText>  texto que puede traer emoji a media frase
import {
  X, Check, CircleCheck, TriangleAlert, Package, ClipboardList, Camera, Ticket, CircleHelp, Lock,
  ChartColumn, Monitor, Laptop, Smartphone, Trash2, KeyRound, Link, FileText, Repeat, Key, Truck,
  Phone, Eye, Factory, Upload, EyeOff, Save, RefreshCw, Globe, BriefcaseBusiness, Signal,
  MessageSquare, Mouse, Plug, CircleX, TrendingUp, Calendar, FolderOpen, Pin, Download, Bell,
  Printer, Database, Paperclip, RadioTower, Pencil, AlarmClock, Mail, Wrench, Hourglass, Users,
  NotebookPen, BatteryFull, Receipt, Hand, Satellite, User, Star, Rocket, Megaphone, Search,
  Shuffle, SmartphoneCharging, Inbox, Target, Image, Ruler, Plus, PenLine, MapPin, Headphones,
  Lightbulb, ThumbsUp, Bot, Asterisk, Video, Compass, Settings, Eraser, ScrollText, Ban,
  Accessibility, ScanSearch, OctagonX, Flame, Smile, Clapperboard, Microscope, Keyboard, Zap,
  Shield, HandHelping, Coins, Tag, PartyPopper, Building2, CreditCard, House, Type, Scissors,
  Clock, Hash, BookOpen, Book, Recycle, Mailbox, Laugh, Meh, Frown, Angry, ThumbsDown,
  Heart, BicepsFlexed, Award, Menu, Power, ArrowUp, ArrowDown, Send, Folder, Notebook, Toolbox,
  SlidersHorizontal, Siren, Hammer, TrendingDown, Trophy, GraduationCap, Snowflake, SquareCheck,
  Briefcase, Car, ConciergeBell, Map, Library, Sparkles, LockOpen, Timer, Circle, HeartHandshake,
  UsersRound, Annoyed, SmilePlus, ArrowRight, MailOpen, Network, Video as VideoIcon, Film, Info,
} from 'lucide-react';

// Emoji → [ícono, color opcional]. Los círculos de color (🔴🟡🟢…) eran
// semáforos: se dibujan como punto relleno del mismo color.
const DOT = (color) => [Circle, color, true];
const MAP = {
  '✕': [X], '✖': [X], '✗': [X], '❌': [CircleX], '✓': [Check], '✔': [Check], '☑': [SquareCheck],
  '✅': [CircleCheck], '⚠': [TriangleAlert], '⛔': [OctagonX], '🚫': [Ban], '❓': [CircleHelp],
  '📦': [Package], '📋': [ClipboardList], '📷': [Camera], '📸': [Camera], '🎫': [Ticket],
  '🔒': [Lock], '🔓': [LockOpen], '📊': [ChartColumn], '📈': [TrendingUp], '📉': [TrendingDown],
  '🖥': [Monitor], '💻': [Laptop], '📱': [Smartphone], '📲': [SmartphoneCharging], '🗑': [Trash2],
  '🔐': [KeyRound], '🔑': [Key], '🔗': [Link], '📄': [FileText], '📜': [ScrollText], '🧾': [Receipt],
  '🔁': [Repeat], '🔄': [RefreshCw], '♻': [Recycle], '🔀': [Shuffle], '🚚': [Truck], '🚗': [Car],
  '📞': [Phone], '👁': [Eye], '👀': [Eye], '🙈': [EyeOff], '🏭': [Factory], '📤': [Upload],
  '📥': [Inbox], '⬇': [Download], '⬆': [ArrowUp], '💾': [Save], '🌐': [Globe], '🧑‍💼': [BriefcaseBusiness],
  '💼': [Briefcase], '📶': [Signal], '📡': [RadioTower], '🛰': [Satellite], '💬': [MessageSquare],
  '🖱': [Mouse], '🔌': [Plug], '🔋': [BatteryFull], '📅': [Calendar], '🗂': [FolderOpen],
  '📂': [FolderOpen], '📁': [Folder], '📌': [Pin], '📍': [MapPin], '🔔': [Bell], '🛎': [ConciergeBell],
  '🖨': [Printer], '📠': [Printer], '🗄': [Database], '📎': [Paperclip], '✏': [Pencil], '✎': [Pencil],
  '🖊': [PenLine], '✍': [PenLine], '📝': [NotebookPen], '📓': [Notebook], '⏰': [AlarmClock],
  '⏱': [Timer], '⏳': [Hourglass], '⌛': [Hourglass], '🕐': [Clock], '🕓': [Clock], '📧': [Mail],
  '✉': [Mail], '📨': [MailOpen], '📬': [Mailbox], '🔧': [Wrench], '🛠': [Hammer], '🧰': [Toolbox],
  '👥': [Users], '🧑‍🤝‍🧑': [UsersRound], '👤': [User], '👋': [Hand], '🙋': [HandHelping],
  '⭐': [Star], '🚀': [Rocket], '📢': [Megaphone], '📣': [Megaphone], '🔍': [Search], '🔎': [ScanSearch],
  '🎯': [Target], '🖼': [Image], '📐': [Ruler], '➕': [Plus], '🎧': [Headphones], '💡': [Lightbulb],
  '👍': [ThumbsUp], '👎': [ThumbsDown], '🤖': [Bot], '✱': [Asterisk], '🎥': [Video], '📹': [VideoIcon],
  '🎬': [Clapperboard], '🧭': [Compass], '⚙': [Settings], '🎚': [SlidersHorizontal], '🧹': [Eraser],
  '🧑‍🦽': [Accessibility], '🔥': [Flame], '❄': [Snowflake], '😊': [Smile], '🙂': [Smile], '😀': [Laugh],
  '😐': [Meh], '🙁': [Frown], '😢': [Frown], '😡': [Angry], '🔬': [Microscope], '⌨': [Keyboard],
  '⚡': [Zap], '🛡': [Shield], '💰': [Coins], '💳': [CreditCard], '🏷': [Tag], '🎉': [PartyPopper],
  '✨': [Sparkles], '🏢': [Building2], '🏠': [House], '🔤': [Type], '✂': [Scissors], '🔢': [Hash],
  '📘': [BookOpen], '📗': [Book], '📚': [Library], '🗺': [Map], '❤': [Heart], '💪': [BicepsFlexed],
  '🏆': [Trophy], '🎓': [GraduationCap], '🚨': [Siren], '☰': [Menu], '⏻': [Power], '➤': [Send],
  '🤝': [HeartHandshake], '🙏': [HeartHandshake], '💯': [Award], '🛎️': [ConciergeBell], '🎞': [Film],
  '🕸': [Network], '→': [ArrowRight], '😅': [Annoyed], '😍': [SmilePlus], 'ℹ': [Info],
  '🔴': DOT('var(--c-red)'), '🟡': DOT('var(--c-amber)'), '🟢': DOT('var(--c-green)'),
  '🟣': DOT('var(--c-violet)'), '🟠': DOT('var(--c-orange)'), '🔵': DOT('var(--c-blue)'),
  '⚪': DOT('var(--text-muted)'),
};

const clean = (e) => (typeof e === 'string' ? e.replace(/️/g, '').trim() : e);

export function hasIcon(e) {
  return !!MAP[clean(e)];
}

const style = { verticalAlign: '-0.125em', flex: 'none' };

export default function Icon({ e, as, color, size = '1em', strokeWidth = 2, className, title, ...rest }) {
  let Cmp = as;
  let fill = 'none';
  if (!Cmp) {
    if (e == null || e === false || e === '') return null;
    if (typeof e !== 'string') return e; // ya es un elemento
    const hit = MAP[clean(e)];
    if (!hit) return <EmojiText>{e}</EmojiText>; // texto normal o emoji sin ícono
    Cmp = hit[0];
    if (!color) color = hit[1];
    if (hit[2]) fill = 'currentColor';
  }
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      color={color || 'currentColor'}
      fill={fill}
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    />
  );
}

// Texto que puede traer emoji a media frase (mensajes, datos guardados):
// cada emoji conocido se dibuja como ícono; el resto del texto queda igual.
const EMOJI_RE = /((?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]️?(?:‍[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?)*))/u;
export function EmojiText({ children }) {
  if (typeof children !== 'string') return children ?? null;
  const parts = children.split(new RegExp(EMOJI_RE.source, 'gu'));
  if (parts.length === 1) return children;
  return parts.map((p, i) => (i % 2 ? (MAP[clean(p)] ? <Icon key={i} e={p} /> : null) : p));
}
