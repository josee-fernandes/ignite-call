import { prisma } from '@/lib/prisma'
// import dayjs from 'dayjs'
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const username = String(req.query.username)
  const { year, month } = req.query

  if (!year || !month) {
    return res.status(400).json({ message: 'Year or month not specified.' })
  }

  const user = await prisma.user.findUnique({ where: { username } })

  if (!user) {
    return res.status(400).json({ message: 'User does not exist.' })
  }

  const availableWeekDays = await prisma.userTimeInterval.findMany({
    select: {
      week_day: true,
    },
    where: {
      user_id: user.id,
    },
  })

  const blockedWeekDays = [0, 1, 2, 3, 4, 5, 6].filter(
    (weekDay) =>
      !availableWeekDays.some(
        (availableWeekDay) => availableWeekDay.week_day === weekDay,
      ),
  )

  // const blockedDatesRaw = await prisma.$queryRaw<Array<{ d: number }>>`
  //   select
  //       extract(day from s.date) as d,
  //       count(s.date) as amount,
  //       ((uti.time_end_in_minutes - uti.time_start_in_minutes) / 60) as s
  //     from schedulings as s
  //     left join user_time_intervals as uti
  //       on uti.week_day = weekday(date_add(s.date, interval 1 day))
  //     where s.user_id = ${user.id}
  //       and date_format(s.date, "%Y-%m") = ${`${year}-${month}`}
  //     group by
  //       extract(day from s.date),
  //       ((uti.time_end_in_minutes - uti.time_start_in_minutes) / 60)
  //     having
  //       amount >= s
  // `

  const blockedDatesRaw = await prisma.$queryRaw<Array<{ d: number }>>`
    select
      extract(day from s.date) as d,
      count(s.date),
      ((uti.time_end_in_minutes - uti.time_start_in_minutes) / 60)
    from schedulings as s
    left join user_time_intervals uti
      on uti.week_day = extract(dow from s.date + interval '1 day')
    where s.user_id = ${user.id}
      and extract(year from s.date) = ${year}::int
      and extract(month from s.date) = ${month}::int
    group by extract(day from s.date),
      ((uti.time_end_in_minutes - uti.time_start_in_minutes) / 60)
    having
      count(s.date) >= ((uti.time_end_in_minutes - uti.time_start_in_minutes) / 60);
  `

  const blockedDates = blockedDatesRaw.map((item) => item.d)

  return res.json({ blockedWeekDays, blockedDates })
}
