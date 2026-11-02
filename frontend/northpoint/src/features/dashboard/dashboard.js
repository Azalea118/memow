import { dashboardSummary, weeklyTotals, monthlyTotals, localDate, recentViolationActivity } from '../../shared/domain.js';

function shortDate(date) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function trendChart(periods,esc,monthly){
 const period=monthly?'month':'week',cap=Math.max(4,Math.ceil(Math.max(...periods.map(p=>p.count))/4)*4);
 const monthLabel=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'});
 const range=p=>monthly?monthLabel(p.start):shortDate(p.start)+' – '+shortDate(p.end);
 let svg=`<svg class="weekly-trend-chart" viewBox="0 0 660 275" role="img" aria-label="Last 6 ${period}s of violations"><title>${esc(periods.map(p=>range(p)+': '+p.count+' violations').join('; '))}</title>`;
 for(let i=0;i<=4;i++){const y=204-i*42;svg+=`<line x1="44" y1="${y}" x2="644" y2="${y}" class="chart-grid"/><text x="23" y="${y+5}" text-anchor="middle">${i*cap/4}</text>`;}
 periods.forEach((p,i)=>{const x=62+i*99,height=p.count/cap*168;svg+=`<g tabindex="0" aria-label="${esc(range(p))}: ${p.count} violations${p.current?', current '+period:''}"><title>${esc(range(p))}: ${p.count} violations</title><rect x="${x}" y="${204-height}" width="48" height="${height}" rx="4" fill="${p.current?'#527ca9':'#c4d6e9'}"/><text x="${x+24}" y="${192-height}" text-anchor="middle" class="bar-number">${p.count}</text><text x="${x+24}" y="234" text-anchor="middle">${esc(monthly?monthLabel(p.start):shortDate(p.start))}</text>${monthly?'':`<text x="${x+24}" y="255" text-anchor="middle" class="week-end">– ${esc(shortDate(p.end))}</text>`}</g>`;});
 const maximum=Math.max(1,...periods.map(p=>p.count));
 return svg+'</svg>'+`<div class="phone-weekly-chart" role="list" aria-label="Last 6 ${period}s of violations">${periods.map(p=>`<div class="phone-week" role="listitem"><div class="phone-week-heading"><span>${esc(range(p))}${p.current?`<span class="phone-current-week">Current ${period}</span>`:''}</span><strong>${p.count}<span class="sr-only"> violations</span></strong></div><div class="phone-week-track" aria-hidden="true"><span style="width:${p.count/maximum*100}%;background:${p.current?'#527ca9':'#aec6df'}"></span></div></div>`).join('')}</div>`;
}

export function renderDashboard(ctx) {
  const { store, esc, icon, person, formatDate, badge, visibleEmployees, visibleViolations } = ctx;
  const employees = visibleEmployees();
  const violations = visibleViolations();
  const summary = dashboardSummary(employees, violations, store.removals);
  const monthly=ctx.getFilters('dashboard').period==='month',period=monthly?'month':'week';
  const weeks=monthly?monthlyTotals(violations,localDate()):weeklyTotals(violations,localDate());
  const recentActivity = (ctx.recentActivity || recentViolationActivity(violations));
  const daysAgo = date => {
    const days = Math.round((Date.parse(localDate()) - Date.parse(String(date).slice(0, 10))) / 86400000);
    return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
  };
  const cards = [
    ['Employees', summary.employees, 'users', '', 'Employee records', 'employees'],
    ['Total Violations', summary.violations, 'shield', 'rose', 'Retained violation records', 'violations'],
    ['Total Points', summary.points, 'clipboard', 'amber', 'Recorded demerit points', 'points'],
    ['Watchlist', summary.watchlist.length, 'alert', 'purple', 'Employees with 2 or more strikes', 'watchlist']
  ];
  const directoryReady=ctx.employeeDirectory?.status==='ready';
  const quickActions=[
    {label:'Issue Violation',icon:'shield',action:'record',disabled:!directoryReady,hint:'Load employees before issuing a violation.'},
    {label:'Add Employee',icon:'users',action:'add-employee',disabled:!directoryReady,hint:'Load employees before adding an employee.'},
    {label:'Timestamp Camera',icon:'camera',action:'navigate',page:'camera',disabled:false},
    {label:'Map Tracking',icon:'map',action:'navigate',page:'tracking',disabled:false}
  ];
  return `<div class="dashboard-simple">
    <section class="metrics-grid" aria-label="Workplace overview"><h2 class="dashboard-summary-heading">Workplace overview</h2>${cards.map(card => `<article class="metric-card"><div class="metric-top"><span class="metric-title">${card[0]}</span><span class="metric-icon ${card[3]}">${icon(card[2], 20)}</span></div><div class="metric-number">${card[1]}</div>${ctx.renderYesterdayChange?ctx.renderYesterdayChange(ctx.comparison?.[card[5]==='employees'?'employees':card[5]==='violations'?'violations':card[5]],icon,ctx.comparison?.reason):''}<div class="metric-bottom">${card[4]}</div><button class="metric-card-link" data-action="dashboard-card" data-target="${card[5]}" aria-label="View ${card[0].toLowerCase()}"></button></article>`).join('')}</section>
    <section class="dashboard-quick-actions" aria-labelledby="dashboard-quick-title"><h2 id="dashboard-quick-title">What would you like to do?</h2><div class="dashboard-action-grid">${quickActions.map(item=>`<button class="dashboard-action-tile" data-action="${item.action}" ${item.page?'data-page="'+item.page+'"':''} ${item.disabled?'disabled title="'+item.hint+'"':''}><span class="dashboard-action-icon">${icon(item.icon,25)}</span><span>${item.label}</span></button>`).join('')}</div></section>
    <div class="dashboard-main-row">
      <section class="panel weekly-panel"><div class="panel-header"><div><h2>Violation Trends</h2><p>${monthly?'Monthly totals':'Weekly totals · Monday to Sunday'} · Last 6 ${period}s</p></div><div class="trend-period-toggle" role="group" aria-label="Violation trends period">${[['week','Weekly'],['month','Monthly']].map(([id,label])=>`<button type="button" data-action="dashboard-trend" data-period="${id}" aria-pressed="${period===id}">${label}</button>`).join('')}</div></div><div class="weekly-chart-body">${trendChart(weeks, esc,monthly)}</div><div class="weekly-chart-footer"><span><i class="legend-dot light"></i> ${monthly?'Monthly':'Weekly'} violations</span><span><i class="legend-dot"></i> Current ${period} (last bar)</span></div></section>
      <section class="panel dashboard-activity-panel"><div class="panel-header"><div><h2>Recent Activity</h2><p>Last 14 days · Latest 5 violations</p></div></div>${ctx.recentState || (recentActivity.length ? `<div class="dashboard-activity-list">${recentActivity.map(violation => {
        const employee = employees.find(employee => employee.apiId ? employee.apiId === violation.employeeApiId : employee.id === violation.employeeId) || violation.employee;
        const initials = employee.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('');
        return `<button class="dashboard-activity-item" data-action="case-details" data-id="${esc(violation.id)}"><span class="avatar" aria-hidden="true">${esc(initials)}</span><span class="dashboard-activity-content"><span class="dashboard-activity-title"><strong>${esc(employee.name)}</strong>${violation.strike ? '<span class="bordered-badge bordered-strike">Strike</span>' : ''}</span><span class="dashboard-activity-detail">was issued <strong>${esc(violation.typeName)}</strong></span></span><span class="dashboard-activity-time">${daysAgo(violation.date)}</span></button>`;
      }).join('')}</div>` : `<div class="empty-state">${icon('clock', 28)}<h3>No recent violations</h3><p>Violations issued in the last 14 days will appear here.</p></div>`)}<div class="panel-link-footer"><button class="button ghost" data-action="navigate" data-page="history">View History ${icon('arrow', 17)}</button></div></section>
    </div>
    <p class="dashboard-totals-note">Totals cover the returned employee directory and its retained violations. Removed records are excluded.</p>
  </div>`;
}
