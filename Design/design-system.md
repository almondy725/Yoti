# EZIT Design System Reference

> 기반 구조: KSNET Design System | Primary: Sky Blue(`#8EC2FC`) | Secondary: Mint Green(`#70D9AD`) | Gray: Cool 계열

---

## 1. Font

- **기본 서체**: Pretendard
- **웨이트**: Regular(400), Medium(500), SemiBold(600), Bold(700)
- **공통 Letter Spacing**: -2% (Display만 -2.5%)

---

## 2. Typography Scale

### Display (SemiBold)
| Token | Size | Line Height | Letter Spacing |
|---|---|---|---|
| Display/1 | 96px | 122px | -2.5% |
| Display/2 | 80px | 102px | -2.5% |
| Display/3 | 64px | 82px | -2.5% |
| Display/4 | 48px | 64px | -2.5% |
| Display/5 | 40px | 54px | -2.5% |
| Display/6 | 36px | 48px | -2.5% |
| Display/7 | 32px | 44px | -2.5% |

### Headline (Bold)
| Token | Size | Line Height |
|---|---|---|
| Headline/1 | 40px | 54px |
| Headline/2 | 32px | 44px |
| Headline/3 | 28px | 40px |
| Headline/4 | 24px | 34px |
| Headline/5 | 22px | 30px |
| Headline/6 | 20px | 28px |
| Headline/7 | 18px | 26px |
| Headline/8 | 16px | 24px |

### Title (SemiBold)
| Token | Size | Line Height |
|---|---|---|
| Title/1 | 32px | 44px |
| Title/2 | 28px | 40px |
| Title/3 | 24px | 34px |
| Title/4 | 20px | 30px |
| Title/5 | 18px | 26px |
| Title/6 | 16px | 24px |
| Title/7 | 14px | 22px |

### Body (Medium)
| Token | Size | Line Height |
|---|---|---|
| Body/1 | 18px | 28px |
| Body/2 | 16px | 26px |
| Body/3 | 15px | 24px |
| Body/4 | 14px | 22px |
| Body/5 | 12px | 20px |

### Caption (Regular)
| Token | Size | Line Height |
|---|---|---|
| Caption/1 | 24px | 36px |
| Caption/2 | 18px | 28px |
| Caption/3 | 16px | 24px |
| Caption/4 | 14px | 22px |
| Caption/5 | 13px | 20px |
| Caption/6 | 12px | 18px |
| Caption/7 | 11px | 17px |

---

## 3. Color System

> **컬러 철학**: KSNET 기반의 실용적인 UI 컬러 시스템. Primary는 하늘색(`#8EC2FC`)으로 숙박 상태 및 주요 강조에 사용하며, Secondary(`#70D9AD`)는 대실 상태 및 보조 액션에 사용한다. 그레이는 Cool 계열로 깔끔하고 전문적인 인상을 준다.

### Brand
| Token | Hex | RGBA | 용도 |
|---|---|---|---|
| primary/main | `#8EC2FC` | rgba(142, 194, 252, 1) | 숙박 상태, 주요 강조, 포인트 |
| primary/medium | `#8EC2FC4D` | rgba(142, 194, 252, 0.3) | 호버 배경, 선택 배경 |
| primary/light | `#8EC2FC1A` | rgba(142, 194, 252, 0.1) | 서브 버튼 배경, 뱃지 |
| secondary/main | `#70D9AD` | rgba(112, 217, 173, 1) | 대실 상태, 보조 CTA |
| secondary/medium | `#70D9AD66` | rgba(112, 217, 173, 0.4) | 보조 호버 배경 |
| secondary/light | `#70D9AD1A` | rgba(112, 217, 173, 0.1) | 보조 서브 배경 |

### Gray Cool
| Token | Hex | 용도 |
|---|---|---|
| gray/900 | `#191F28` | 주요 텍스트 |
| gray/800 | `#333D4B` | 강조 보조 텍스트 |
| gray/700 | `#4E5968` | 보조 텍스트, 아이콘 |
| gray/600 | `#6B7684` | 비활성 텍스트 |
| gray/500 | `#8B95A1` | 플레이스홀더 |
| gray/400 | `#B0B8C1` | 비활성 아이콘 |
| gray/300 | `#D1D6DB` | 중간 테두리 |
| gray/200 | `#E5E8EB` | 기본 테두리, 구분선 |
| gray/100 | `#F2F4F6` | 서브 배경, hover 배경 |
| gray/50 | `#F9FAFB` | 페이지 배경 |

### System Text
| Token | Hex | 용도 |
|---|---|---|
| text/black/static | `#191F28` | 고정 검정 (모드 불변) |
| text/black/primary | `#191F28` | 주요 텍스트 |
| text/black/secondary | `#4E5968` | 보조 텍스트 |
| text/black/tertiary | `#6B7684` | 3차 텍스트 |
| text/black/disabled | `#B0B8C1` | 비활성 텍스트 |
| text/white/static | `#FFFFFF` | 고정 흰색 |
| text/white/primary | `#FFFFFF` | 흰배경 위 주요 |
| text/white/secondary | `rgba(255,255,255,0.72)` | 흰배경 위 보조 |

### System Border
| Token | Hex | 용도 |
|---|---|---|
| border/bold | `#191F28` | 강조 테두리 (포커스, 선택) |
| border/medium | `#B0B8C1` | 중간 테두리 |
| border/default | `#D1D6DB` | 기본 테두리 |
| border/light | `#E5E8EB` | 연한 테두리, 구분선 |

### Black / White Opacity
| Token | Opacity |
|---|---|
| black/100 ~ black/5 | 100%, 90%, 80%, 70%, 60%, 50%, 40%, 30%, 20%, 10%, 5% |
| white/100 ~ white/5 | 100%, 90%, 80%, 70%, 60%, 50%, 40%, 30%, 20%, 10%, 5% |

### Elevation Background
| Token | 값 (Light) | 용도 |
|---|---|---|
| elevation/background/level-0 | `#F2F4F6` | 가장 낮은 캔버스 (앱 뒤 배경, 섹션 구분) |
| elevation/background/level-1 | `#F9FAFB` | 페이지 기본 배경 |
| elevation/background/level-2 | `#FFFFFF` | 카드, 섹션 컨테이너 |
| elevation/background/level-3 | `#FFFFFF` | 모달, 팝오버, 드롭다운 |

### State Colors
| Token | Hex | 용도 |
|---|---|---|
| state/success/default | `#62BB47` | 성공 |
| state/success/medium | `#62BB474D` | 성공 배경(30%) |
| state/success/light | `#62BB471A` | 성공 배경(10%) |
| state/alert/default | `#FFBC44` | 경고 |
| state/alert/medium | `#FFBC444D` | 경고 배경 |
| state/alert/light | `#FFBC441A` | 경고 배경 |
| state/error/default | `#EE313C` | 에러 |
| state/error/medium | `#EE313C4D` | 에러 배경 |
| state/error/light | `#EE313C1A` | 에러 배경 |

### Tag / Badge Colors (Bright + Trans 2-tone 시스템)

> Bright: 텍스트/아이콘용 원색 컬러 | Trans: 배경용 10% 투명도 컬러

| Token | Bright (텍스트/아이콘) | Trans (배경, 10% opacity) |
|---|---|---|
| red | `#FB4958` | `#FB49581A` |
| orange | `#FF6F00` | `#FF6F001A` |
| yellow | `#FFAB00` | `#FFAB001A` |
| lightgreen | `#37DA1A` | `#64DD171A` |
| green | `#00BFA5` | `#00BFA51A` |
| blue | `#009DFF` | `#009DFF1A` |
| navy | `#2979FF` | `#2979FF1A` |
| purple | `#651FFF` | `#651FFF1A` |
| pink | `#FF5CBE` | `#FF5CBE1A` |
| gray | `#4E5968` | `#4E59681A` |

---

## 4. Spacing System

### Primitive Number Scale
```
0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 120, 160, 999(max)
```

### Gap Tokens (Semantic)
| Token | Value |
|---|---|
| g0 | 0px |
| g1 | 1px |
| g2 | 2px |
| g3 | 4px |
| g4 | 6px |
| g5 | 8px |
| g6 | 10px |
| g7 | 12px |
| g8 | 14px |
| g9 | 16px |
| g10 | 18px |
| g11 | 20px |
| g12 | 24px |
| g13 | 28px |

### Padding Tokens (Semantic)
| Token | Value |
|---|---|
| p0 | 0px |
| p1 | 1px |
| p2 | 2px |
| p3 | 4px |
| p4 | 6px |
| p5 | 8px |
| p6 | 10px |
| p7 | 12px |
| p8 | 14px |
| p9 | 16px |
| p10 | 18px |
| p11 | 20px |
| p12 | 24px |
| p13 | 28px |
| p14 | 32px |
| p15 | 80px |
| p16 | 96px |
| p17 | 120px |

### Size Tokens
| Token | Value |
|---|---|
| size-1 | 6px |
| size-2 | 8px |
| size-3 | 10px |
| size-4 | 12px |
| size-5 | 14px |
| size-6 | 16px |
| size-7 | 18px |
| size-8 | 24px |
| size-9 | 28px |
| size-10 | 32px |
| size-11 | 36px |
| size-12 | 40px |
| size-13 | 48px |
| size-14 | 80px |

---

## 5. Radius

| Token | Value |
|---|---|
| xxsmall | 1px |
| xsmall | 2px |
| small | 4px |
| medium | 6px |
| large | 8px |
| xlarge | 14px |
| xxlarge | 18px |
| full | 999px |

---

## 6. Elevation (Shadow)

> 기준 색상: `#919EAB` (Cool Gray). 단계별로 blur와 offset을 증가시켜 depth를 표현한다.

### Elevation/0
- `0 4px 12px rgba(145, 158, 171, α)` — Header, Navigation, Tab, Button, Badge, Chip 등 최하위 요소

### Elevation/1
- `0 8px 16px rgba(145, 158, 171, α)` — Banner, Accordion, List, Card 등

### Elevation/2
- `0 0 12px rgba(145, 158, 171, α)`
- `0 24px 32px -4px rgba(145, 158, 171, α)` — Scrolled Header, Floating Button, Tooltip

### Elevation/3
- `0 0 16px rgba(145, 158, 171, α)`
- `0 32px 48px -8px rgba(145, 158, 171, α)` — Date/Time Picker, Modal, Bottom Sheet

### Blur
- Blur/1: background-blur 20px
- Blur/2: background-blur 24px
- Blur/3: background-blur 64px

---

## 7. CSS Variable Naming Convention

### Color
| Figma Token | CSS Variable | 값 |
|---|---|---|
| `primary/main` | `--ez-color-primary` | `#8EC2FC` |
| `primary/medium` | `--ez-color-primary-medium` | `rgba(142,194,252,0.3)` |
| `primary/light` | `--ez-color-primary-light` | `rgba(142,194,252,0.1)` |
| `secondary/main` | `--ez-color-secondary` | `#70D9AD` |
| `secondary/medium` | `--ez-color-secondary-medium` | `rgba(112,217,173,0.4)` |
| `secondary/light` | `--ez-color-secondary-light` | `rgba(112,217,173,0.1)` |
| `checkin/main` | `--ez-color-checkin` | `#8B5CF6` |
| `checkin/light` | `--ez-color-checkin-light` | `rgba(139,92,246,0.08)` |
| `checkin/border` | `--ez-color-checkin-border` | `rgba(139,92,246,0.35)` |
| `error/light` | `--ez-color-error-light` | `rgba(238,49,60,0.08)` |
| `error/border` | `--ez-color-error-border` | `rgba(238,49,60,0.35)` |
| `system/text/black/primary` | `--ez-color-text-primary` | `#191F28` |
| `system/text/black/secondary` | `--ez-color-text-secondary` | `#4E5968` |
| `system/text/black/disabled` | `--ez-color-text-disabled` | `#B0B8C1` |
| `system/border/default` | `--ez-color-border` | `#D1D6DB` |
| `system/border/bold` | `--ez-color-border-bold` | `#191F28` |
| `system/gray/900` | `--ez-color-gray-900` | `#191F28` |
| `system/gray/50` | `--ez-color-gray-50` | `#F9FAFB` |
| `elevation/background/level-0` | `--ez-bg-canvas` | `#F2F4F6` |
| `elevation/background/level-1` | `--ez-bg-page` | `#F9FAFB` |
| `elevation/background/level-2` | `--ez-bg-card` | `#FFFFFF` |
| `elevation/background/level-3` | `--ez-bg-modal` | `#FFFFFF` |
| `system/state/error/default` | `--ez-color-error` | `#EE313C` |
| `system/state/success/default` | `--ez-color-success` | `#62BB47` |
| `system/state/alert/default` | `--ez-color-alert` | `#FFBC44` |

### Spacing
| Figma Token | CSS Variable | Value |
|---|---|---|
| `gap/g5` | `--ez-spacing-5` | 8px |
| `gap/g9` | `--ez-spacing-9` | 16px |
| `padding/p7` | `--ez-padding-7` | 12px |

### Typography
| Figma Token | CSS Variable | Value |
|---|---|---|
| `Headline/4` | `--ez-font-headline-4` | 24px/34px Bold |
| `Title/5` | `--ez-font-title-5` | 18px/26px SemiBold |
| `Body/2` | `--ez-font-body-2` | 16px/26px Medium |
| `Caption/4` | `--ez-font-caption-4` | 14px/22px Regular |

### Radius
| Figma Token | CSS Variable | Value |
|---|---|---|
| `radius/medium` | `--ez-radius-md` | 6px |
| `radius/large` | `--ez-radius-lg` | 8px |
| `radius/full` | `--ez-radius-full` | 999px |

---

## 8. Property → Props Mapping

### Common Rules
| Figma Property | React Prop | Mapping |
|---|---|---|
| Size=56/48/40/32 | `size="xl"\|"lg"\|"md"\|"sm"` | 56→xl, 48→lg, 40→md, 32→sm |
| State=default/hover/disabled | 기본/`:hover`/`disabled` prop | hover는 CSS pseudo, disabled는 boolean |
| Style=primary/error/... | `variant="primary"\|"error"\|...` | 그대로 매핑 |
| Round=default/circle | `rounded?: boolean` | circle→true |
| Outline=true/false | `outline?: boolean` | 그대로 매핑 |
| Boolean (Left Icon 등) | `leftIcon?: ReactNode` | boolean → slot/children |
| TEXT (Label 등) | `label?: string` | 텍스트 값 |
| Selected=true/false | `selected?: boolean` | 그대로 매핑 |
| Collapsed=true/false | `collapsed?: boolean` | 그대로 매핑 |
| Stretch=true/false | `stretch?: boolean` | 그대로 매핑 |

---

## 9. Component Dependencies

```
Button/Bar
├─ uses: Icons, Spinner

Button/Text
├─ uses: Icons

Button/Check
├─ uses: Icons

Textfield/Input
├─ uses: Title Area (atomic), Icons, Helper (atomic), Scroll Bar

Textfield/Area
├─ uses: Title Area (atomic), Helper (atomic), Scroll Bar

Selector/Field
├─ uses: Title Area (atomic), Icons, Helper (atomic)

Selector/List
├─ uses: Selector/Atomic/Item ×6, Scroll Bar

Selector/Atomic/Item
├─ uses: Icons, Avatar/Single, Selector/Atomic/Option

Selector/Atomic/Option
├─ uses: Button/Check, Button/Radio, Button/Toggle

Tab/List
├─ uses: Tab/Item ×7

Tab/Item
├─ uses: Icons, Badge

Badge
├─ uses: Icons

Accordion
├─ uses: Icons

Bottom
├─ uses: Button/Bar ×3 (Primary, Secondary, Tertiary)

Modal
├─ uses: Modal/Atomic/Header, Contents, Bottom

Modal/Atomic/Header
├─ uses: Icons

Navigation
├─ uses: Navigation/Menu ×6

Navigation/Menu
├─ uses: Icons

Header/App
├─ uses: Icons, Button/Bar, Avatar/Single

Header/Web
├─ uses: Icons, Button/Text (메뉴), Button/Bar (CTA), Avatar/Single, Textfield/Input (검색)

Table/Td
├─ uses: Avatar/Single, Icons, Table/Td/Title, Table/Td/Subtitle, Button/Bar, Button/Check, Button/Toggle, Selector/Field, Textfield/Input, Badge

Table/Th
├─ uses: Icons, Button/Check

List/Item
├─ uses: Image, Icons, List/Item/Information, Button/Toggle, Button/Bar

List/Text/Group
├─ uses: List/Text/Row ×5

List/Text/Row
├─ uses: List/Text/Bullet
```

---

## 10. Component Detail — Button

### Button/Bar (480 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 56, 48, 40, 32 | 56 |
| Style | VARIANT | primary, primary-trans, error, gray, bg-inverse, bg-inverse-trans, bg, bg-trans | primary |
| State | VARIANT | default, hover, disabled | default |
| Round | VARIANT | default, circle | default |
| Outline | VARIANT | false, true | false |
| Label | BOOLEAN | — | true |
| Left Icon | BOOLEAN | — | true |
| Right Icon | BOOLEAN | — | true |
| Loading Spinner | BOOLEAN | — | false |
| ∟Label | TEXT | — | "버튼 레이블" |

**Structure**
```
Button/Bar [Horizontal, center-aligned, padding: 0 20px]
├─ Spinner          [INSTANCE: Spinner] (숨김, Loading=true 시 표시)
│   ├─ base         [ELLIPSE] 원형 트랙
│   └─ spinner      [ELLIPSE] 회전 인디케이터
├─ Icon (L)         [INSTANCE: Icons/Size=24] 좌측 아이콘
├─ Text             [TEXT: Body/2, Pretendard Medium 16px] 버튼 레이블
└─ Icon (R)         [INSTANCE: Icons/Size=24] 우측 아이콘
```

**Style Color Mapping**
| Style | Background | Text | Border |
|---|---|---|---|
| primary | `--ez-color-primary` (#8EC2FC) | `#FFFFFF` | — |
| primary-trans | primary/light (rgba 142,194,252, 0.1) | primary/main | — |
| error | `--ez-color-error` (#EE313C) | white | — |
| bg-inverse | black/100 | white | — |
| gray | gray/100 (#F2F4F6) | gray/700 (#4E5968) | — |
| bg | white | black | border/default (#D1D6DB) |
| bg-trans | transparent | black | — |
| bg-inverse-trans | transparent | white | — |

### Button/Text (72 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 48, 40, 32 | 48 |
| Style | VARIANT | default, gray | default |
| State | VARIANT | default, hover, disabled | default |
| Padding | VARIANT | true, false | true |
| Underline | VARIANT | false, true | false |
| Label | BOOLEAN | — | true |
| Left Icon | BOOLEAN | — | true |
| Right Icon | BOOLEAN | — | true |
| ∟Label | TEXT | — | "버튼 레이블" |

**Structure**
```
Button/Text [Horizontal, center-aligned]
├─ Icon (L)        [INSTANCE: Icons/Size=24]
├─ text-wrapper    [FRAME]
│   └─ Text        [TEXT: Body/2, Pretendard Medium 16px]
└─ Icon (R)        [INSTANCE: Icons/Size=24]
```

### Button/Check (36 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 32, 24, 20 | 32 |
| Type | VARIANT | none, box, circle | box |
| Available | VARIANT | true, false | true |
| Selected | VARIANT | true, false | true |
| Label | BOOLEAN | — | true |
| ∟Label | TEXT | — | "버튼 레이블" |

**Structure**
```
Button/Check [Horizontal, center-aligned]
├─ Checkbox        [FRAME: border-radius 4px]
│   └─ Icons       [INSTANCE: System/check] 체크 아이콘
└─ 버튼 레이블      [TEXT: Body/3, Pretendard Medium 15px]
```

### Button/Radio (24 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 32, 24, 20 | 32 |
| Style | VARIANT | fill, outline | fill |
| Available | VARIANT | true, false | true |
| Selected | VARIANT | false, true | true |
| Label | BOOLEAN | — | true |
| ∟Label | TEXT | — | "버튼 레이블" |

**Structure**
```
Button/Radio [Horizontal, center-aligned]
├─ radio           [FRAME: border-radius full(원형)]
│   └─ circle      [ELLIPSE] 선택 인디케이터
└─ 버튼 레이블      [TEXT: Body/3, Pretendard Medium 15px]
```

### Button/Toggle (48 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 48, 40, 32, 24 | 48 |
| Type | VARIANT | A, B, C | A |
| Available | VARIANT | true, false | false |
| Selected | VARIANT | true, false | false |

**Structure**
```
Button/Toggle [FRAME: border-radius full(pill)]
└─ handle          [RECTANGLE: 원형 핸들, 좌↔우 이동]
```

---

## 11. Component Detail — Textfield

### Textfield/Input (72 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 56, 48, 40, 32 | 56 |
| Style | VARIANT | default, circle, underline | default |
| State | VARIANT | default, activated, focused, error, disabled, unavailable | default |
| Title Area | BOOLEAN | — | true |
| Left Icon | BOOLEAN | — | true |
| Right Icon | BOOLEAN | — | true |
| Delete Button | BOOLEAN | — | true |
| Unit | BOOLEAN | — | true |
| Helper | BOOLEAN | — | true |
| Placeholder | TEXT | — | "내용을 입력해 주세요." |
| ∟Unit | TEXT | — | "원" |

**Structure**
```
Textfield/Input [Vertical]
├─ Field Area              [FRAME: Vertical]
│   ├─ Title Area          [INSTANCE: Title/Area atomic]
│   │   └─ title_text      [FRAME]
│   │       ├─ Heading Icon [INSTANCE: Icons] (선택)
│   │       ├─ 타이틀       [TEXT: Caption/4, Regular 14px]
│   │       └─ essential    [FRAME: "*" 필수 표시] (선택)
│   └─ Textfield           [FRAME: Horizontal, border-radius medium(6px)]
│       ├─ Left Icon       [INSTANCE: Icons/Size=24]
│       ├─ Placeholder     [TEXT: Body/2, Medium 16px] — 입력값/플레이스홀더
│       └─ Right Side      [FRAME]
│           ├─ Unit        [TEXT: Body/2] 단위 텍스트
│           ├─ Delete      [INSTANCE: Icons] X 버튼
│           └─ Icon (R)    [INSTANCE: Icons/Size=24]
└─ Helper                  [INSTANCE: Textfield/Atomic/Helper]
    ├─ Content             [FRAME] 설명 텍스트 (Caption/5, Regular 13px)
    ├─ Check List          [FRAME] 유효성 체크 리스트 ×4
    └─ Counter             [FRAME] 글자수 카운터 "0/50"
```

**State Color Mapping**
| State | Border | Background | Text |
|---|---|---|---|
| default | border/default (#D1D6DB) | white | text/disabled (#B0B8C1) |
| activated | border/default (#D1D6DB) | white | text/primary (#191F28) |
| focused | primary/main (#F5821F) | white | text/primary (#191F28) |
| error | state/error/default (#EE313C) | state/error/light | text/primary |
| disabled | border/light (#E5E8EB) | gray/50 (#F9FAFB) | text/disabled |

### Textfield/Area (18 variants)
**Structure**
```
Textfield/Area [Vertical]
├─ Field Area              [FRAME: Vertical]
│   ├─ Title Area          [INSTANCE: Title/Area atomic]
│   └─ Textfield           [FRAME: border-radius medium(6px), 높이 가변]
│       ├─ Placeholder     [TEXT: Body/2, Medium 16px]
│       └─ Scroll Bar      [INSTANCE: Scroll Bar]
└─ Helper                  [INSTANCE: Textfield/Atomic/Helper]
```

---

## 12. Component Detail — Selector

### Selector/Field (54 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 56, 48, 40 | 56 |
| Style | VARIANT | default, circle, underline | default |
| State | VARIANT | default, activated, focused, error, disabled, unavailable | default |
| Title Area | BOOLEAN | — | true |
| Left Icon | BOOLEAN | — | true |
| Chevron | BOOLEAN | — | true |
| Delete Button | BOOLEAN | — | true |
| Helper | BOOLEAN | — | true |
| Placeholder | TEXT | — | "플레이스홀더" |

**Structure** — Textfield/Input과 동일한 패턴, Icon(R) 대신 Chevron

### Selector/List (18 variants, legacy)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Type | VARIANT | default, avatar, icon | icon |
| Option | VARIANT | none, chevron, check, addition, radio, toggle | none |
| Scroll | BOOLEAN | — | true |

**Structure**
```
Selector/List [Vertical, border-radius large(8px), border]
├─ Selector/Atomic/Item ×6  [INSTANCE]
│   ├─ Hover               [FRAME] (마우스오버 배경 gray/100 #F2F4F6, 숨김)
│   ├─ Icon (L)            [INSTANCE: Icons] (Type=icon일 때 표시)
│   ├─ Avartar             [INSTANCE: Avatar/Single] (Type=avatar일 때 표시)
│   ├─ 선택항목              [TEXT: Caption/3, Regular 16px]
│   ├─ 추가정보              [TEXT: Caption/4, Regular 14px] (숨김)
│   ├─ Divider             [FRAME: 1px 구분선, border/light #EAEAEA] (숨김)
│   ├─ Chevron             [INSTANCE: Arrows/chevron-right] (Option=chevron일 때)
│   └─ Option              [INSTANCE: Selector/Atomic/Option] (Option=check/radio/toggle일 때)
└─ Scroll Bar              [INSTANCE: Scroll Bar]
```

### Selector/Atomic/Item (24 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 56, 48, 40, 32 | 56 |
| State | VARIANT | default, selected, disabled | selected |
| Padding | VARIANT | true, false | true |
| Left Icon | BOOLEAN | — | true |
| Avatar | BOOLEAN | — | true |
| Label | BOOLEAN | — | true |
| Hover | BOOLEAN | — | false |
| Divider | BOOLEAN | — | true |
| Chevron | BOOLEAN | — | false |
| Options | BOOLEAN | — | true |
| Title | TEXT | — | "선택항목" |
| ∟Label | TEXT | — | "추가정보" |

---

## 13. Component Detail — Tab

### Tab/Item (18 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | large, medium, small | large |
| Style | VARIANT | bar, outline, underline | bar |
| Selected | VARIANT | true, false | true |
| Badge | BOOLEAN | — | false |
| Left Icon | BOOLEAN | — | false |
| Label | TEXT | — | "레이블" |

**Structure**
```
Tab/Item [Horizontal, center-aligned]
├─ Icons           [INSTANCE: Icons] (숨김, Left Icon=true 시 표시)
├─ Label Area      [FRAME]
│   └─ 레이블       [TEXT: Title/6, SemiBold 16px (selected) / Caption/3, Regular 16px (unselected)]
└─ Badge           [INSTANCE: Badge] (숨김, Badge=true 시 표시)
```

### Tab/List (18 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 56, 48, 40 | 56 |
| Style | VARIANT | bar, outline, underline | bar |
| Stretch | VARIANT | true, false | false |
| Tab 1~7 | BOOLEAN (각각) | — | Tab 1~3=true, Tab 4~7=false |

**Structure**
```
Tab/List [Horizontal]
├─ Tab 1           [INSTANCE: Tab/Item] (selected)
├─ Tab 2           [INSTANCE: Tab/Item]
├─ Tab 3           [INSTANCE: Tab/Item]
├─ Tab 4           [INSTANCE: Tab/Item] (숨김)
├─ Tab 5           [INSTANCE: Tab/Item] (숨김)
├─ Tab 6           [INSTANCE: Tab/Item] (숨김)
└─ Tab 7           [INSTANCE: Tab/Item] (숨김)
```

---

## 14. Component Detail — Accordion

### Accordion (8 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 80, 64, 48, 40 | 80 |
| Collapsed | VARIANT | true, false | true |
| Left Icon | BOOLEAN | — | true |
| Subtitle | BOOLEAN | — | true |
| Divider | BOOLEAN | — | false |
| Contents | BOOLEAN | — | true |
| Title | TEXT | — | "아코디언 타이틀" |
| ∟Subtitle | TEXT | — | "서브 타이틀" |

**Structure**
```
Accordion [Vertical]
├─ Accordion Header    [FRAME: Horizontal]
│   ├─ Left side       [FRAME]
│   │   ├─ Left Icon   [INSTANCE: Icons]
│   │   ├─ Title       [TEXT: Title/5~6, SemiBold]
│   │   └─ Subtitle    [TEXT: Caption/4, Regular 14px]
│   └─ Right side      [FRAME]
│       └─ Chevron     [INSTANCE: Icons] (↑/↓토글)
├─ Divider             [FRAME: 1px, border/light #EAEAEA] (숨김)
└─ Contents            [FRAME] (Collapsed=false일 때 표시)
    └─ 콘텐츠 영역       [자유 구성]
```

---

## 15. Component Detail — Badge

### Badge (216 variants)
**Properties**
| Property | Type | Values | Default |
|---|---|---|---|
| Size | VARIANT | 32, 24, 20, 16 | 24 |
| Style | VARIANT | fill, outline, trans | fill |
| Color | VARIANT | primary, gray, success, alert, error, red, orange, yellow, lightgreen, green, blue, navy, purple, pink | primary |
| Label | BOOLEAN | — | true |
| Left Icon | BOOLEAN | — | false |
| Right Icon | BOOLEAN | — | false |
| ∟Label | TEXT | — | "레이블" |

**Color Mapping**

*fill 스타일 — 진한 배경 (강조용, 최소한으로 사용)*
| Color | Background | Text |
|---|---|---|
| primary | `#8EC2FC` | `#FFFFFF` |
| gray | `#F2F4F6` | `#4E5968` |
| success | `#62BB47` | white |
| alert | `#FFBC44` | `#191F28` |
| error | `#EE313C` | white |

*soft 스타일 — 10% 투명도 배경 (태그, 라벨 기본값 — 주로 이 스타일 사용)*
| Color | Background (Trans 10%) | Text (Bright) |
|---|---|---|
| red | `#FB49581A` | `#FB4958` |
| orange | `#FF6F001A` | `#FF6F00` |
| yellow | `#FFAB001A` | `#FFAB00` |
| lightgreen | `#64DD171A` | `#37DA1A` |
| green | `#00BFA51A` | `#00BFA5` |
| blue | `#009DFF1A` | `#009DFF` |
| navy | `#2979FF1A` | `#2979FF` |
| purple | `#651FFF1A` | `#651FFF` |
| pink | `#FF5CBE1A` | `#FF5CBE` |
| gray | `#4E59681A` | `#4E5968` |

---

## 16. Storybook Component Catalog

> **Storybook URL**: `https://storybook-static-lemon-eight.vercel.app`
> **총 52개 컴포넌트 / 180+ stories** | React + Vite 기반

### Foundation

| Component | Stories |
|---|---|
| Icons | All Icons, Arrows, System, Action, Sizes, Colors |

### Action (버튼/인터랙션)

| Component | Stories | 핵심 Props |
|---|---|---|
| Bar Button | Default, With Left/Right/Both Icons, All Sizes, All Variants, Outline, Loading, Disabled | `size`, `variant`, `outline`, `loading`, `disabled`, `leftIcon`, `rightIcon` |
| Text Button | Default, Gray, Underline, Sizes, Disabled | `size`, `variant`, `underline`, `disabled` |
| Checkbox | Default, Checked, Circle, None, Disabled, With Label | `type(box/circle/none)`, `checked`, `disabled`, `label` |
| Toggle | Default, Checked, All Sizes, Disabled | `size`, `checked`, `disabled` |

### Form (입력/선택)

| Component | Stories | 핵심 Props |
|---|---|---|
| AccessCheck | Default, Disabled, Small | `size`, `disabled` |
| Chip | Default, With Left Icon, All Sizes, States, With Close | `size`, `selected`, `leftIcon`, `closable` |
| HelperText | Default, States, With Check List, With Counter | `state(default/error/success)`, `checkList`, `counter` |
| Radio | Default, All Sizes, Variants, Disabled | `size`, `variant(fill/outline)`, `disabled` |
| SelectorField | Default, With Title/Helper, With Value, With Left Icon, Error, Variants, Full | `size`, `state`, `titleArea`, `leftIcon`, `chevron`, `helper` |
| SelectorItem | Default, Selected, With Avatar, With Icon, With Trailing, With Chevron, List | `size`, `state(default/selected/disabled)`, `avatar`, `leftIcon`, `chevron`, `options` |
| SelectorList | Default, Scrollable | `type(default/avatar/icon)`, `option(none/check/radio/toggle/chevron)` |
| Slider | Single, Range, Medium, Disabled | `mode(single/range)`, `size`, `disabled` |
| Stepper | Default, Separated, Wrapped, Disabled | `variant`, `disabled` |
| TextArea | Default, With Title/Helper, Error, With Counter, All Sizes, Full, Disabled | `size`, `state`, `titleArea`, `helper`, `counter` |
| TextInput | Default, With Title/Helper, Error, Checklist, Counter, Left/Right Icon, All Sizes, Variants, Full, With Unit | `size`, `state`, `titleArea`, `leftIcon`, `rightIcon`, `deleteButton`, `unit`, `helper` |

### Display (표시)

| Component | Stories | 핵심 Props |
|---|---|---|
| Accordion | Default, All Sizes, Default Open | `size(80/64/48/40)`, `collapsed`, `leftIcon`, `subtitle`, `divider` |
| Avatar | Default, All Sizes, Colors, With Status, Status Indicator, Multiple | `size`, `color`, `status`, `src` |
| Badge | Default, All Styles, Outline, Transparent, Circle, Sizes, With Left/Right/Both Icons | `size(32/24/20/16)`, `variant(fill/outline/trans)`, `color`, `leftIcon`, `rightIcon` |
| Empty | Default, With Action, With Image, Medium | `size`, `image`, `actionButton` |
| ImageBox | Default, Rounded, With Outline | `rounded`, `outline` |
| ImageRatio | Square, Landscape, Portrait | `ratio` |
| ListItem | Default, With Image/Avatar/Title Icon/Button/Toggle, Full, All Sizes | `size`, `image`, `avatar`, `titleIcon`, `button`, `toggle` |
| TitleList | Default, Essential, With Left Icon, With Trailing Button, With Error/Info | `essential`, `leftIcon`, `trailingButton`, `state` |
| TitleSection | Default, With Icon, With Buttons, All Sizes | `size`, `icon`, `buttons` |

### Navigation (내비게이션)

| Component | Stories | 핵심 Props |
|---|---|---|
| BottomBar | Default, Two Columns, With Label | `columns`, `label` |
| BottomNavigation | Default, Five Items, Rounded | `items`, `rounded` |
| Header | Default, With Icons/Avatar/Trailing Button, Center Aligned, Small | `size`, `align`, `avatar`, `trailingButton` |
| NavigationMenu | Default, Selected, Only Icon, Primary, All Items | `selected`, `iconOnly`, `variant` |
| Sidebar | Default, Condensed | `condensed` |
| SidebarMenu | Default, Selected, With Badge/Chevron, Menu List, Condensed | `selected`, `badge`, `chevron`, `condensed` |
| Tab | Bar, Outline, Underline, With Left Icon, With Badge, Stretched | `variant(bar/outline/underline)`, `leftIcon`, `badge`, `stretch` |

### Data (테이블)

| Component | Stories | 핵심 Props |
|---|---|---|
| TableTitle | Dot, Bar, With Badge | `variant(dot/bar)`, `badge` |
| TableSubtitle | Default, Dot Separator, Count | `separator`, `count` |
| TableTh | Default, Sortable, With Checkbox | `sortable`, `checkbox` |

### Overlay (오버레이)

| Component | Stories | 핵심 Props |
|---|---|---|
| Modal | Window, Window With Icon, Bottom Sheet, Bottom Sheet No Nav, Center Aligned, Close Button Types | `type(window/bottomSheet)`, `align`, `closeButton`, `icon` |
| ModalHeader | Header Left/Center, With Icon, Content Variant, Close Button Types, Main Title | `align`, `icon`, `closeButton`, `variant` |
| Toast | Default, All Variants, With Action, With Close | `variant`, `action`, `closable` |
| Tooltip | Default, Variants, With Close | `variant`, `closable` |

### Pagination (페이지네이션)

| Component | Stories | 핵심 Props |
|---|---|---|
| PaginationButton | Default, All Types | `type` |
| PaginationCircle | Default, Current, All Sizes | `current`, `size` |
| PaginationCircular | Default, Stretched | `stretched` |
| PaginationNumeric | Start, Middle, End | `position` |
| PaginationPage | Default, Selected, Page Row | `selected` |

### Picker (선택기)

| Component | Stories | 핵심 Props |
|---|---|---|
| PickerCalendar | Day View, Month View, Year View | `view(day/month/year)` |
| PickerKnob | Default, States | `state` |
| PickerRange | Default | — |
| PickerSlot | Time View, Day View | `view(time/day)` |

### Progress (진행)

| Component | Stories | 핵심 Props |
|---|---|---|
| ProgressBar | Default, All Sizes | `size`, `value` |
| ProgressInterval | Horizontal, Vertical | `direction` |
| ProgressStep | Default, All States | `state` |
| ProgressStepper | Horizontal, Vertical, Icon Variant | `direction`, `variant(default/icon)` |

---

## 17. Figma ↔ Storybook 컴포넌트 매핑

> Figma 컴포넌트명과 Storybook 컴포넌트명의 대응 관계

| Figma Component | Storybook Component | 비고 |
|---|---|---|
| Button/Bar | Action/Bar Button | 동일 구조 |
| Button/Text | Action/Text Button | 동일 구조 |
| Button/Check | Action/Checkbox | Figma의 box/circle/none → Storybook type |
| Button/Radio | Form/Radio | 카테고리만 다름 |
| Button/Toggle | Action/Toggle | 카테고리만 다름 |
| Textfield/Input | Form/TextInput | 동일 구조 |
| Textfield/Area | Form/TextArea | 동일 구조 |
| Selector/Field | Form/SelectorField | 동일 구조 |
| Selector/List | Form/SelectorList | 동일 구조 |
| Selector/Atomic/Item | Form/SelectorItem | Atomic prefix 제거 |
| Tab/Item + Tab/List | Navigation/Tab | 합쳐서 단일 컴포넌트 |
| Badge | Display/Badge | 동일 |
| Accordion | Display/Accordion | 동일 |
| Modal + Modal/Atomic/Header | Overlay/Modal + Overlay/ModalHeader | Atomic prefix 제거 |
| Navigation + Navigation/Menu | Navigation/Sidebar + Navigation/SidebarMenu | 네이밍 변경 |
| Header/App + Header/Web | Navigation/Header | 합쳐서 단일 컴포넌트 |
| Table/Td | — | Storybook 미구현 (Td는 조합으로 처리) |
| Table/Th | Data/TableTh | 동일 |
| List/Item | Display/ListItem | 동일 |
| Avatar/Single | Display/Avatar | Single suffix 제거 |
| Bottom | Navigation/BottomBar | 네이밍 변경 |

---

> **버전**: EZIT Design System v1.1 | **기반**: KSNET Design System 구조 | **Primary**: Sky Blue(`#8EC2FC`) | **Secondary**: Mint Green(`#70D9AD`) | **Checkin**: Purple(`#8B5CF6`) | **Background**: `#F9FAFB` | **Gray**: Cool 계열
