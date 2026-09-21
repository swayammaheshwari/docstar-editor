import { useEffect, useRef } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { Menu } from "@mantine/core";
import { MdCancel, MdCheckCircle, MdError, MdInfo } from "react-icons/md";

// The types of alerts that users can choose from.
export const alertTypes = [
  {
    title: "Warning",
    value: "warning",
    icon: MdError,
    color: "#e69819",
    backgroundColor: {
      light: "#fff6e6",
      dark: "#805d20",
    },
  },
  {
    title: "Error",
    value: "error",
    icon: MdCancel,
    color: "#d80d0d",
    backgroundColor: {
      light: "#ffe6e6",
      dark: "#802020",
    },
  },
  {
    title: "Info",
    value: "info",
    icon: MdInfo,
    color: "#507aff",
    backgroundColor: {
      light: "#e6ebff",
      dark: "#203380",
    },
  },
  {
    title: "Success",
    value: "success",
    icon: MdCheckCircle,
    color: "#0bc10b",
    backgroundColor: {
      light: "#e6ffe6",
      dark: "#208020",
    },
  },
] as const;

// The Alert block.
export const Alert = createReactBlockSpec(
  {
    type: "alert",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
      type: {
        default: "warning",
        values: ["warning", "error", "info", "success"],
      },
    },
    content: "inline",
  },
  {
    render: (props) => {
      const alertType = alertTypes.find(
        (a) => a.value === props.block.props.type
      )!;
      const Icon = alertType.icon;

      // Every custom block created via `createReactBlockSpec` gets
      // `isolating: true` hardcoded internally (not something the public
      // block-spec API can disable). Combined with BlockNote's own
      // block-level Backspace command chain, this makes Backspace anywhere
      // inside an isolating inline-content block resolve to selecting and
      // deleting the ENTIRE node instead of one character — confirmed by
      // testing a bare content-only custom block with no extra markup at
      // all, same bug. Normal character-by-character deletion doesn't go
      // through that command chain — it's driven by the browser's native
      // `beforeinput` event and ProseMirror's own DOM-mutation observation
      // — so intercepting only the "Backspace" keydown here blocks the
      // buggy whole-block deletion without touching normal typing.
      //
      // This has to be a REAL native listener attached directly to the DOM
      // node (`addEventListener`), not React's `onKeyDown` prop — React 17+
      // delegates synthetic events from the root container, so a React
      // handler here would only run *after* the native event has already
      // bubbled through (and been handled by) ProseMirror's own listener on
      // `view.dom` (a real ancestor of this node, see
      // prosemirror-view/src/input.ts), too late to stop anything.
      const contentElRef = useRef<HTMLDivElement | null>(null);
      const setContentRef = (node: HTMLDivElement | null) => {
        contentElRef.current = node;
        props.contentRef(node);
      };
      useEffect(() => {
        const el = contentElRef.current;
        if (!el) return;
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Backspace") {
            e.stopPropagation();
          }
        };
        el.addEventListener("keydown", onKeyDown);
        return () => el.removeEventListener("keydown", onKeyDown);
      }, []);

      return (
        <div className={"alert"} data-alert-type={props.block.props.type}>
          {/*Icon which opens a menu to choose the Alert type*/}
          <Menu withinPortal={false}>
            <Menu.Target>
              <div className={"alert-icon-wrapper"} contentEditable={false}>
                <Icon
                  className={"alert-icon"}
                  data-alert-icon-type={props.block.props.type}
                  size={32}
                />
              </div>
            </Menu.Target>
            {/*Dropdown to change the Alert type*/}
            <Menu.Dropdown>
              <Menu.Label>Alert Type</Menu.Label>
              <Menu.Divider />
              {alertTypes.map((type) => {
                const ItemIcon = type.icon;

                return (
                  <Menu.Item
                    key={type.value}
                    leftSection={
                      <ItemIcon
                        className={"alert-icon"}
                        data-alert-icon-type={type.value}
                      />
                    }
                    onClick={() =>
                      props.editor.updateBlock(props.block, {
                        type: "alert",
                        props: { type: type.value },
                      })
                    }
                  >
                    {type.title}
                  </Menu.Item>
                );
              })}
            </Menu.Dropdown>
          </Menu>
          {/*Rich text field for user to type in*/}
          <div className={"inline-content"} ref={setContentRef} />
        </div>
      );
    },
    // Markdown has no native alert/admonition syntax, and BlockNote's
    // markdown exporter has no "raw HTML passthrough" for unrecognized
    // custom elements the way `marked` does (it silently unwraps them) —
    // so a `<alert>` tag written here would just vanish. The literal
    // `<alert>...</alert>` wrapper in exported markdown is produced instead
    // by `wrapAlertBlocksForMarkdown` in `DocstarEditor.tsx`, which replaces
    // `alert` blocks with plain paragraphs containing that literal text
    // right before serialization — paragraph text content is emitted
    // verbatim, unlike custom block HTML. `toExternalHTML` here only
    // matters for non-markdown HTML export (e.g. clipboard copy).
    toExternalHTML: (props) => (
      <div>
        <alert data-alert-type={props.block.props.type}>
          <span ref={props.contentRef} />
        </alert>
      </div>
    ),
  }
);
