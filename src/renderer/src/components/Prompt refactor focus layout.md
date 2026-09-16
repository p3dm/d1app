Refactor phần focus/selected-phone UI trong project hiện tại để layout và behavior bám sát HTML reference đã cung cấp.

### Mục tiêu

Implement lại cơ chế focus phone theo đúng concept:

**Master Phone Inspector + Command Panel + Device Grid**

Focus phone KHÔNG được phóng to trực tiếp trong grid và KHÔNG được remove khỏi grid.

Khi một phone được focus:

1. Phone đó vẫn giữ nguyên vị trí trong `PhoneGrid`.
2. Phone đó được đánh dấu selected/controlled bằng visual state.
3. Một `Master Phone` lớn được render ở khu vực riêng bên trái grid.
4. Một `Command Control Panel` nằm ngay bên phải Master Phone.
5. Master Phone và Command Panel là một khu vực inspector riêng, không phải một item của grid.
6. Khi focus phone khác, chỉ data/state của inspector và selected state của card thay đổi; không thay đổi layout grid.

### Layout reference

HTML reference đang có cấu trúc:

```text
┌───────────────────────────────┬──────────────────────────────────────┐
│                               │                                      │
│       MASTER PHONE            │        COMMAND CONTROL PANEL         │
│       280 × 590               │        210 × 590                     │
│                               │                                      │
│       enlarged view            │        search                        │
│                               │        command list                   │
│                               │        app dock                       │
│                               │        navigation                     │
│                               │                                      │
└───────────────────────────────┴──────────────────────────────────────┘

                              DEVICE GRID

                    ┌────┬────┬────┬────┐
                    │ 01 │ 02 │ 03 │ 04 │
                    ├────┼────┼────┼────┤
                    │ 05 │ 06 │ 07 │ 08 │
                    ├────┼────┼────┼────┤
                    │ 09 │ 10 │ 11 │ 12 │
                    └────┴────┴────┴────┘
```

Trong reference, inspector là:

```html
<section data-purpose="master-phone-inspector">
```

Master phone:

```html
<div class="w-[280px] h-[590px] ...">
```

Command panel:

```html
<div class="w-[210px] h-[590px] ...">
```

Device grid:

```html
<main data-purpose="screen-matrix-viewport">
```

và:

```html
<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 ...">
```

### Selected phone behavior

Phone đang được focus phải vẫn tồn tại trong grid.

Ví dụ phone `08` là selected:

```text
normal phone:
border-zinc-900
shadow-lg

selected phone:
border-2 border-[#00e599]
shadow-[0_0_20px_rgba(0,229,153,0.3)]
```

Selected card cần thể hiện rõ:

- green border `#00e599`
- green glow
- icon/star màu green
- IP màu green
- trạng thái `CONTROLLED`
- subtitle `Master mirror active`

Không thay đổi kích thước/aspect ratio của card selected so với các card khác.

### Master Phone

Master phone phải có:

- width: 280px
- height: 590px
- background: black
- border trắng mờ
- border-radius khoảng 10px
- dark shadow
- padding khoảng 12px
- layout vertical
- nội dung được chia thành:
  - status bar
  - master information
  - central screen/app area
  - app grid
  - bottom dock
  - Android navigation bar

Visual style phải giữ đúng reference:

- background `#000`
- text trắng/zinc
- accent chính `#00e599`
- font thiên về monospace
- dark industrial/dev-tool aesthetic
- border trắng với opacity thấp
- green glow rất nhẹ

### Inspector background

Khu vực inspector sử dụng dark background với dotted radial pattern:

```css
background-color: rgb(6, 8, 7);
background-image: radial-gradient(
  rgba(0, 229, 153, 0.15) 1.2px,
  transparent 1.2px
);
background-size: 20px 20px;
```

Có border-right:

```css
border-right: 1px solid rgba(0, 229, 153, 0.12);
```

### Command Panel

Command panel:

- width khoảng 210px
- height 590px
- background `#0c0f0e`
- header `#121413`
- border trắng opacity thấp
- border-radius khoảng 6px
- font monospace
- cùng chiều cao với Master Phone

Các khu vực:

1. Header
2. Search input
3. `COMMAND OPS`
4. Command list
5. `APPS DOCK`
6. Android navigation controls

Command hover:

```css
background: rgba(0, 229, 153, 0.10);
```

Active accent:

```css
#00e599
```

Danger action như End Task dùng red.

### Component architecture

Không hard-code focus UI trực tiếp trong `PhoneGrid`.

Tách thành component riêng, ví dụ:

```text
PhoneFocusInspector
├── MasterPhone
└── PhoneCommandPanel
```

PhoneGrid chỉ chịu trách nhiệm:

```text
render phones
selected phone state
onSelect(phone)
```

Parent component quản lý:

```ts
const [focusedPhoneId, setFocusedPhoneId] = useState<string | null>(null)
```

và truyền:

```tsx
<PhoneFocusInspector
  phone={focusedPhone}
  onClose={...}
/>

<PhoneGrid
  phones={phones}
  focusedPhoneId={focusedPhoneId}
  onPhoneFocus={setFocusedPhoneId}
/>
```

Nếu project đã có state/focus logic trong WebRTC, hãy refactor để state focus mới trở thành nguồn dữ liệu duy nhất thay vì duy trì hai cơ chế focus song song.

### CSS

Tôi đã có `main.css`.

Ưu tiên:

1. Tận dụng class/component/style hiện có trong `main.css`.
2. Không duplicate CSS nếu đã có utility/class tương đương.
3. Nếu thiếu style cần thiết, thêm CSS component-specific vào `main.css`.
4. Không tạo inline style trừ khi style thực sự phụ thuộc runtime/data.
5. Giữ responsive behavior của grid hiện tại.

### Quan trọng về responsive

Inspector và grid phải được layout sao cho:

- desktop: inspector bên trái, grid bên phải
- grid vẫn scroll độc lập
- inspector không làm selected phone biến mất khỏi grid
- không phá responsive grid hiện tại
- khi viewport nhỏ, có thể chuyển inspector thành stacked/top section nếu kiến trúc hiện tại yêu cầu, nhưng desktop phải giữ đúng reference.

### Interaction

Khi click phone A:

```text
focusedPhoneId = A
```

Kết quả:

```text
Inspector → hiển thị A
Grid → A có selected style
Các phone khác → normal style
```

Khi click phone B:

```text
focusedPhoneId = B
```

Kết quả:

```text
Inspector → chuyển sang B
A → normal
B → selected
```

Không tạo thêm một phone card mới trong grid.

### Không được làm

Không:

- clone selected phone thành một grid item mới
- remove selected phone khỏi grid
- reorder selected phone lên đầu grid
- scale selected card
- dùng `position: fixed` để đặt focus phone đè lên grid
- tạo một second independent focus state nếu project đã có state dùng được
- phá WebRTC stream/reference hiện tại
- thay đổi logic kết nối chỉ vì refactor UI
- hard-code `08` hoặc một device ID cụ thể

### Acceptance criteria

1. Click bất kỳ phone nào → phone đó trở thành focused.
2. Phone focused vẫn nằm đúng vị trí trong grid.
3. Phone focused có green border + green glow.
4. Inspector bên trái hiển thị phone focused.
5. Inspector gồm Master Phone + Command Panel.
6. Grid không bị overlay bởi inspector.
7. Click phone khác → focus chuyển đúng sang phone mới.
8. Chỉ có một phone selected tại một thời điểm.
9. WebRTC/device connection logic hiện tại không bị thay đổi.
10. CSS đạt visual structure gần sát HTML reference.
11. Không duplicate focus state.
12. TypeScript không có lỗi type sau khi refactor.

Trước khi sửa code, hãy inspect các component hiện tại (`PhoneGrid`, WebRTC client/focus logic, `main.css`) để xác định state và component boundary hiện có. Sau đó thực hiện refactor tối thiểu, ưu tiên reuse code thay vì viết lại toàn bộ.