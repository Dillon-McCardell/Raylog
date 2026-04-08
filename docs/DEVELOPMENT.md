# Development Notes

## Window Flow

This diagram is the implementation-facing source of truth for Raylog's current
window and navigation flow. The automated test suite validates the Mermaid block
below so the documented flow stays aligned with the extension behavior.

```mermaid
flowchart TD
    A["Raylog"] --> B["List Tasks command"]
    A --> C["Add Task command"]
    A --> M["Refresh Menu Bar command"]

    B --> Z["Storage note configured and valid?"]
    C --> Z
    Z -->|"No"| Z1["Setup / reset empty state"]
    Z1 -->|"Open Extension Preferences"| Z
    Z1 -->|"Generate New Task Database"| Z
    Z1 -->|"Reset Storage Note"| Z

    subgraph LIST["List Tasks"]
        Z -->|"Yes, launch List Tasks"| B1["Task list with detail pane"]
        B1 -->|"Enter"| E["View Task window"]
        B1 -->|"Cmd+L"| N["Edit Task form (new log focused)"]
        B1 -->|"Cmd+N"| F["Add Task form"]
        B1 -->|"Cmd+E"| G["Edit Task form"]
        B1 -->|"Cmd+Shift+C"| I["Complete selected task"]
        B1 -->|"Cmd+S"| J["Start selected task"]
        B1 -->|"Cmd+R"| K["Reopen selected task"]
        B1 -->|"Cmd+Shift+A"| L["Archive selected task"]
        B1 -->|"Search or Filter"| B1

        I --> B1
        J --> B1
        K --> B1
        L --> B1

        F -->|"Save"| B1
        G -->|"Save"| B1
    end

    subgraph ADD["Add Task"]
        Z -->|"Yes, launch Add Task"| C1["Standalone Add Task form"]
        C1 -->|"Save"| C2["Pop to root"]
    end

    subgraph VIEW["View Task"]
        E --> E1["Full-window task detail"]
        E1 -->|"Default action: Log Work"| N
        E1 -->|"Cmd+E"| O["Edit Task form"]
        E1 -->|"Cmd+Shift+C"| P["Complete task"]
        E1 -->|"Start Task"| Q["Start task"]
        E1 -->|"Reopen Task"| R["Reopen task"]
        E1 -->|"Archive Task"| S["Archive task"]
        E1 -->|"Delete Task"| U["Delete task"]
        E1 -->|"Reload"| E1

        N -->|"Save"| E1
        N -->|"Status behavior: auto-start or keep or prompt"| E1

        O -->|"Save"| E1
        O -->|"Cmd+D on focused log"| T["Delete Work Log confirm"]
        T -->|"Confirm"| O
        T -->|"Cancel"| O

        P --> E1
        Q --> E1
        R --> E1
        S --> E1
        U --> E1
    end

    subgraph MENU["Refresh Menu Bar"]
        M --> M1["Current task in menu bar"]
        M -->|"No storage note"| M3["Set Up Raylog menu bar state"]
        M1 -->|"Click current task"| E1
        M1 -->|"Complete Current Task"| M2["Complete current task"]
        M1 -->|"Click task in Next 5 Tasks"| E1
        M1 -->|"Open Task List"| B1

        M2 --> M1
        M3 -->|"Open Extension Preferences"| Z
    end
```
